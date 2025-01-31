const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

// Enable CORS for all routes with more permissive settings
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Expose-Headers', '*');
    
    // Set proper content types for HLS content
    if (req.path.endsWith('.m3u8')) {
        res.header('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (req.path.endsWith('.ts')) {
        res.header('Content-Type', 'video/mp2t');
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

const PORT = process.env.PORT || 8080;
const DATA_DIR = '/app/data';
const STREAMS_DIR = path.join(DATA_DIR, 'streams');

// Store active streams
const activeStreams = new Map();

// Middleware
app.use(bodyParser.json());

// Serve stream files
app.get('/stream/:streamId/*', async (req, res, next) => {
    const streamId = req.params.streamId;
    const filePath = req.params[0];
    const fullPath = path.join(STREAMS_DIR, streamId, filePath);
    
    console.log('Stream request:', {
        streamId,
        filePath,
        fullPath
    });
    
    try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) {
            console.error('Not a file:', fullPath);
            return res.status(404).send('Not found');
        }
        
        // Set appropriate headers based on file type
        if (filePath.endsWith('.m3u8')) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        } else if (filePath.endsWith('.ts')) {
            res.setHeader('Content-Type', 'video/mp2t');
        }
        
        res.sendFile(fullPath);
    } catch (error) {
        console.error('Error serving stream file:', error);
        res.status(404).send('Not found');
    }
});

// Ensure directories exist
async function ensureDirectories() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(STREAMS_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating directories:', error);
    }
}

// Start a new stream using ffmpeg
async function startStream(id, url, options = {}) {
    console.log('Starting stream with options:', { id, url, options });
    
    const streamDir = path.join(STREAMS_DIR, id);
    await fs.mkdir(streamDir, { recursive: true });

    // Create an M3U8 playlist file
    const playlistPath = path.join(streamDir, 'playlist.m3u8');
    
    const ffmpegArgs = [
        '-i', url,
        '-c', 'copy',                    // Copy streams without re-encoding
        '-f', 'hls',                     // Force HLS output
        '-hls_time', '4',                // Longer segments for stability
        '-hls_list_size', '5',           // Keep more segments in the playlist
        '-hls_flags', 'delete_segments+append_list+discont_start',  // Better handling of discontinuities
        '-hls_segment_type', 'mpegts',   // Use MPEGTS segments
        '-hls_init_time', '4',           // Initial segment duration
        '-hls_playlist_type', 'event',   // Event type playlist for live streaming
        '-method', 'PUT',                // Use PUT method for better segment writing
        '-timeout', '10',                // Network timeout
        '-reconnect', '1',               // Enable reconnection
        '-reconnect_at_eof', '1',        // Reconnect at EOF
        '-reconnect_streamed', '1',      // Reconnect if stream ends
        '-reconnect_delay_max', '5',     // Maximum reconnection delay
        '-analyzeduration', '2147483647', // Maximum analyze duration
        '-probesize', '2147483647',      // Maximum probe size
    ];

    // Add ignore errors flag if specified
    if (options.ignoreErrors) {
        console.log('Adding -xerror flag for stream:', id);
        ffmpegArgs.push('-xerror');
    }

    // Add output path
    ffmpegArgs.push(
        '-hls_segment_filename', path.join(streamDir, 'segment%d.ts'),
        playlistPath
    );

    console.log('FFmpeg command:', 'ffmpeg', ffmpegArgs.join(' '));
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    ffmpeg.stderr.on('data', (data) => {
        console.log(`Stream ${id} ffmpeg: ${data}`);
    });

    ffmpeg.on('close', (code) => {
        console.log(`Stream ${id} closed with code ${code}`);
        if (activeStreams.has(id)) {
            const stream = activeStreams.get(id);
            stream.status = 'stopped';
            // Clean up stream directory
            fs.rm(streamDir, { recursive: true, force: true }).catch(console.error);
        }
    });

    return ffmpeg;
}

// Start a new HLS-Proxy stream
app.post('/start', async (req, res) => {
    const { url, id, ignoreErrors } = req.body;
    console.log('Received start request:', { url, id, ignoreErrors });
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // If an ID is provided, use it (for restarts), otherwise generate new ID
    const streamId = id || Date.now().toString();
    
    try {
        // If stream exists, stop it first
        if (activeStreams.has(streamId)) {
            console.log('Stopping existing stream:', streamId);
            const existingStream = activeStreams.get(streamId);
            if (existingStream.status === 'running') {
                existingStream.process.kill();
            }
        }

        const ffmpeg = await startStream(streamId, url, { ignoreErrors });
        const proxyUrl = `/stream/${streamId}/playlist.m3u8`;
        
        const stream = {
            id: streamId,
            url,
            proxyUrl,
            process: ffmpeg,
            status: 'running',
            startTime: new Date().toISOString(),
            ignoreErrors: !!ignoreErrors
        };

        activeStreams.set(streamId, stream);
        
        const responseData = {
            id: streamId,
            url,
            proxyUrl,
            status: 'running',
            startTime: stream.startTime,
            ignoreErrors: !!ignoreErrors
        };
        console.log('Sending response:', responseData);
        res.json(responseData);
    } catch (error) {
        console.error('Error starting stream:', error);
        res.status(500).json({ error: error.message });
    }
});

// Restart a stream
app.post('/restart/:id', async (req, res) => {
    const { id } = req.params;
    const { ignoreErrors } = req.body;
    console.log('Received restart request:', { id, ignoreErrors });
    
    const stream = activeStreams.get(id);
    
    if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
    }

    try {
        // Stop existing stream if running
        if (stream.status === 'running') {
            console.log('Stopping existing stream for restart:', id);
            stream.process.kill();
            
            // Wait for the process to fully stop
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Clean up the stream directory
            const streamDir = path.join(STREAMS_DIR, id);
            try {
                await fs.rm(streamDir, { recursive: true, force: true });
            } catch (error) {
                console.error('Error cleaning up stream directory:', error);
            }
            
            // Recreate the stream directory
            await fs.mkdir(streamDir, { recursive: true });
        }

        // Start the stream with new settings
        const ffmpeg = await startStream(id, stream.url, { ignoreErrors });
        
        stream.process = ffmpeg;
        stream.status = 'running';
        stream.startTime = new Date().toISOString();
        stream.ignoreErrors = !!ignoreErrors;

        const responseData = {
            id,
            url: stream.url,
            proxyUrl: stream.proxyUrl,
            status: 'running',
            startTime: stream.startTime,
            ignoreErrors: stream.ignoreErrors
        };
        console.log('Sending restart response:', responseData);
        res.json(responseData);
    } catch (error) {
        console.error('Error restarting stream:', error);
        res.status(500).json({ error: error.message });
    }
});

// Stop a stream
app.post('/stop/:id', async (req, res) => {
    const { id } = req.params;
    const stream = activeStreams.get(id);
    
    if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
    }

    stream.process.kill();
    stream.status = 'stopped';
    
    res.json({ success: true });
});

// Delete a stream
app.delete('/stream/:id', async (req, res) => {
    const { id } = req.params;
    const stream = activeStreams.get(id);
    
    if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
    }

    if (stream.status === 'running') {
        stream.process.kill();
    }
    
    activeStreams.delete(id);

    // Clean up stream directory
    try {
        const streamDir = path.join(STREAMS_DIR, id);
        await fs.rm(streamDir, { recursive: true, force: true });
    } catch (error) {
        console.error(`Error cleaning up stream ${id}:`, error);
    }

    res.json({ success: true });
});

// Get all active streams
app.get('/streams', (req, res) => {
    const streams = Array.from(activeStreams.values()).map(({ id, url, proxyUrl, status, startTime, ignoreErrors }) => ({
        id,
        url,
        proxyUrl,
        status,
        startTime,
        ignoreErrors
    }));
    
    res.json(streams);
});

// Initialize directories
ensureDirectories();

// Start server
app.listen(PORT, () => {
    console.log(`HLS-Proxy wrapper running on port ${PORT}`);
});

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const M3UParser = require('./m3uParser');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = '/app/data';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

// Load providers from JSON file
async function loadProviders() {
    try {
        const data = await fs.readFile(path.join(DATA_DIR, 'providers.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Save providers to JSON file
async function saveProviders(providers) {
    await fs.writeFile(path.join(DATA_DIR, 'providers.json'), JSON.stringify(providers, null, 2));
}

// Load channels cache from JSON file
async function loadChannelsCache() {
    try {
        const data = await fs.readFile(path.join(DATA_DIR, 'channels_cache.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Save channels cache to JSON file
async function saveChannelsCache(cache) {
    await fs.writeFile(path.join(DATA_DIR, 'channels_cache.json'), JSON.stringify(cache, null, 2));
}

// Create WebSocket server
const wss = new WebSocket.Server({ noServer: true });
let connectedClients = new Set();

// Broadcast stream stats to all connected clients
const broadcastStreamStats = (streamId, stats) => {
  const message = JSON.stringify({
    type: 'stream_stats',
    streamId,
    stats
  });

  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Poll HLS-proxy for stream status
let streams = [];
async function pollStreamStatus(streamId) {
  try {
    const stream = streams.find(s => s.id === streamId);
    if (!stream) {
      console.log(`Stream ${streamId} not found, stopping polling`);
      return;
    }

    const response = await axios.get(`http://hls-proxy:8080/stream/${streamId}/status`);
    
    if (response.status === 200) {
      const stats = response.data;
      updateStreamStats(streamId, stats);
    }
  } catch (error) {
    // Only log if it's not a 404 error
    if (error.response && error.response.status !== 404) {
      console.error(`Error polling stream ${streamId} status:`, error.message);
      if (error.response) {
        console.error('Response:', error.response.status, error.response.statusText);
      }
    }
  }

  // Continue polling if the stream still exists
  if (streams.find(s => s.id === streamId)) {
    setTimeout(() => pollStreamStatus(streamId), 5000);
  }
}

// Update stream stats function
function updateStreamStats(streamId, stats) {
  const stream = streams.find(s => s.id === streamId);
  if (stream) {
    stream.stats = stats;
    broadcastStreams();
  }
}

// Broadcast current streams to all connected clients
function broadcastStreams() {
  const message = JSON.stringify({
    type: 'streams',
    streams: streams
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Active streams polling
const activePolling = new Map();

// Start polling for a stream
const startPolling = (streamId) => {
  if (activePolling.has(streamId)) {
    return;
  }

  console.log(`Starting polling for stream ${streamId}`);
  const interval = setInterval(() => pollStreamStatus(streamId), 1000);
  activePolling.set(streamId, interval);
};

// Stop polling for a stream
const stopPolling = (streamId) => {
  const interval = activePolling.get(streamId);
  if (interval) {
    console.log(`Stopping polling for stream ${streamId}`);
    clearInterval(interval);
    activePolling.delete(streamId);
  }
};

// Store active streams with their channel info and order
let activeStreamsInfo = new Map();
let streamOrder = [];

// Update stream order when streams are added or removed
const updateStreamOrder = (streamId, remove = false) => {
  if (remove) {
    streamOrder = streamOrder.filter(id => id !== streamId);
  } else if (!streamOrder.includes(streamId)) {
    streamOrder.push(streamId);
  }
};

// Track provider loading status
const providerLoadingStatus = new Map();

// Helper function to load channels for a provider
async function loadChannelsForProvider(provider) {
    try {
        console.log('Loading channels for provider:', provider.name);
        
        // Set initial loading status
        providerLoadingStatus.set(provider.id, {
            status: 'loading',
            progress: 0,
            lastUpdate: new Date().toISOString()
        });

        const response = await axios.get(provider.m3uUrl);
        const m3uContent = response.data;
        
        // Update status to parsing
        providerLoadingStatus.set(provider.id, {
            status: 'parsing',
            progress: 20,
            lastUpdate: new Date().toISOString()
        });

        // Parse M3U content
        const channels = [];
        const lines = m3uContent.split('\n');
        let currentChannel = null;
        let processedLines = 0;
        const totalLines = lines.length;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            processedLines++;

            // Update progress every 100 lines
            if (processedLines % 100 === 0) {
                const progress = Math.min(20 + Math.floor((processedLines / totalLines) * 60), 80);
                providerLoadingStatus.set(provider.id, {
                    status: 'parsing',
                    progress: progress,
                    lastUpdate: new Date().toISOString()
                });
            }

            if (line.startsWith('#EXTINF:')) {
                // Parse channel info
                const channelInfo = {};
                const matches = {
                    name: line.match(/,(.+)$/),
                    tvgId: line.match(/tvg-id="([^"]+)"/),
                    tvgName: line.match(/tvg-name="([^"]+)"/),
                    tvgLogo: line.match(/tvg-logo="([^"]+)"/),
                    groupTitle: line.match(/group-title="([^"]+)"/)
                };

                channelInfo.name = matches.name ? matches.name[1] : 'Unknown Channel';
                if (matches.tvgId) channelInfo.tvgId = matches.tvgId[1];
                if (matches.tvgName) channelInfo.tvgName = matches.tvgName[1];
                if (matches.tvgLogo) channelInfo.logo = matches.tvgLogo[1];
                if (matches.groupTitle) channelInfo.group = matches.groupTitle[1];

                currentChannel = channelInfo;
            } else if (line.startsWith('http') && currentChannel) {
                // Add URL to channel and save it
                currentChannel.url = line;
                channels.push(currentChannel);
                currentChannel = null;
            }
        }

        // Update status to saving
        providerLoadingStatus.set(provider.id, {
            status: 'saving',
            progress: 90,
            lastUpdate: new Date().toISOString()
        });

        // Update cache with new channels
        const cache = await loadChannelsCache();
        const currentTime = new Date().toISOString();
        cache[provider.id] = {
            lastUpdate: new Date().toISOString(),
            channels: channels
        };
        await saveChannelsCache(cache);

        // Update final status
        providerLoadingStatus.set(provider.id, {
            status: 'completed',
            progress: 100,
            channelCount: channels.length,
            lastUpdate: new Date().toISOString()
        });

        return channels;
    } catch (error) {
        console.error('Error loading channels:', error);
        providerLoadingStatus.set(provider.id, {
            status: 'error',
            error: error.message,
            progress: 0,
            lastUpdate: new Date().toISOString()
        });
        throw error;
    }
}

// Get provider loading status
app.get('/api/providers/:id/status', async (req, res) => {
    const { id } = req.params;
    const status = providerLoadingStatus.get(id) || {
        status: 'unknown',
        lastUpdate: null
    };
    res.json(status);
});

// Routes
app.get('/api/providers', async (req, res) => {
    const providers = await loadProviders();
    res.json(providers);
});

app.post('/api/providers', async (req, res) => {
    try {
        const { name, m3uUrl, username, password } = req.body;
        const providers = await loadProviders();
        const currentTime = new Date().toISOString();
        
        // Create new provider
        const newProvider = {
            id: Date.now().toString(),
            name,
            m3uUrl,
            username,
            password,
            addedAt: currentTime,
            lastUpdated: currentTime
        };

        // Save provider first
        providers.push(newProvider);
        await saveProviders(providers);

        // Set initial loading status
        providerLoadingStatus.set(newProvider.id, {
            status: 'loading',
            lastUpdate: currentTime
        });

        // Start loading channels asynchronously
        loadChannelsForProvider(newProvider).catch(error => {
            console.error('Error loading channels for provider:', error);
        });

        // Return immediately with the new provider info
        res.json(newProvider);
    } catch (error) {
        console.error('Error creating provider:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/providers/:id', async (req, res) => {
    const { id } = req.params;
    const providers = await loadProviders();
    const filteredProviders = providers.filter(p => p.id !== id);
    await saveProviders(filteredProviders);

    // Remove channels from cache
    const cache = await loadChannelsCache();
    delete cache[id];
    await saveChannelsCache(cache);

    res.json({ success: true });
});

// Get all channels from all providers
app.get('/api/channels', async (req, res) => {
    try {
        const { search, group } = req.query;
        const cache = await loadChannelsCache();
        let allChannels = [];

        // Flatten all channels from all providers
        Object.entries(cache).forEach(([providerId, data]) => {
            const channelsWithProvider = data.channels.map(channel => ({
                ...channel,
                providerId
            }));
            allChannels = allChannels.concat(channelsWithProvider);
        });

        // Apply filters if provided
        if (search) {
            const searchLower = search.toLowerCase();
            allChannels = allChannels.filter(channel => 
                channel.name.toLowerCase().includes(searchLower)
            );
        }

        if (group) {
            allChannels = allChannels.filter(channel => 
                channel.group === group
            );
        }

        res.json(allChannels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get unique channel groups
app.get('/api/channels/groups', async (req, res) => {
    try {
        const cache = await loadChannelsCache();
        const groups = new Set();

        Object.values(cache).forEach(({ channels }) => {
            channels.forEach(channel => {
                if (channel.group) {
                    groups.add(channel.group);
                }
            });
        });

        res.json(Array.from(groups).sort());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function to parse M3U content
function parseM3U(content) {
    const channels = [];
    const lines = content.split('\n');
    let currentChannel = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            // Parse channel info
            const match = line.match(/,(.+)$/);
            if (match) {
                currentChannel = {
                    name: match[1].trim(),
                    logo: '', // Initialize logo
                    group: '', // Initialize group
                    id: ''    // Initialize id
                };

                // Extract tvg-logo
                const logoMatch = line.match(/tvg-logo="([^"]+)"/);
                if (logoMatch) {
                    currentChannel.logo = logoMatch[1];
                }

                // Extract tvg-group
                const groupMatch = line.match(/group-title="([^"]+)"/);
                if (groupMatch) {
                    currentChannel.group = groupMatch[1];
                }

                // Extract tvg-id
                const idMatch = line.match(/tvg-id="([^"]+)"/);
                if (idMatch) {
                    currentChannel.id = idMatch[1];
                }
            }
        } else if (!line.startsWith('#') && currentChannel) {
            // This is the URL line
            currentChannel.url = line;
            channels.push(currentChannel);
            currentChannel = null;
        }
    }

    return channels;
}

// Refresh provider endpoint
app.post('/api/providers/:id/refresh', async (req, res) => {
    const providerId = req.params.id;
    try {
        const providers = await loadProviders();
        const provider = providers.find(p => p.id === providerId);
        if (!provider) {
            return res.status(404).json({ error: 'Provider not found' });
        }

        // Construct the URL with credentials if present
        let url = provider.m3uUrl;
        if (provider.username && provider.password) {
            const urlObj = new URL(provider.m3uUrl);
            urlObj.username = provider.username;
            urlObj.password = provider.password;
            url = urlObj.toString();
        }

        console.log('Fetching M3U from URL:', url);

        // Fetch and parse the M3U file
        const response = await axios.get(url);
        const m3uContent = response.data;
        
        // Parse channels
        const channels = parseM3U(m3uContent);
        console.log(`Parsed ${channels.length} channels`);
        
        // Update the channels cache
        const cache = await loadChannelsCache();
        const currentTime = new Date().toISOString();
        cache[providerId] = {
            channels,
            lastUpdated: currentTime
        };
        await saveChannelsCache(cache);

        console.log('Before update - Provider:', provider);
        
        // Update provider's lastUpdated timestamp
        const updatedProvider = {
            ...provider,
            lastUpdated: currentTime
        };
        
        // Update the provider in the providers array
        const updatedProviders = providers.map(p => 
            p.id === providerId ? updatedProvider : p
        );
        
        console.log('After update - Provider:', updatedProvider);
        
        // Save the updated providers array
        await saveProviders(updatedProviders);

        // Update loading status
        providerLoadingStatus.set(provider.id, {
            status: 'completed',
            progress: 100,
            channelCount: channels.length,
            lastUpdate: currentTime
        });

        res.json({ 
            success: true, 
            lastUpdated: currentTime,
            channelCount: channels.length
        });
    } catch (error) {
        console.error('Error details:', error);
        
        // Update loading status to error
        providerLoadingStatus.set(providerId, {
            status: 'error',
            error: error.message
        });
        
        res.status(500).json({ 
            error: error.message,
            details: error.response ? error.response.data : null
        });
    }
});

app.get('/api/providers', async (req, res) => {
    try {
        const providers = await loadProviders();
        console.log('Get providers response:', providers);
        res.json(providers);
    } catch (error) {
        console.error('Error getting providers:', error);
        res.status(500).json({ error: error.message });
    }
});

// HLS-Proxy stream management
app.post('/api/streams', async (req, res) => {
    const { url } = req.body;
    try {
        // Find channel info before starting stream
        const cache = await loadChannelsCache();
        let channelInfo = null;
        
        // Search through all channels to find a match
        Object.values(cache).some(({ channels }) => {
            const channel = channels.find(ch => ch.url === url);
            if (channel) {
                channelInfo = channel;
                return true;
            }
            return false;
        });

        // Forward the stream to HLS-Proxy
        const response = await axios.post('http://hls-proxy:8080/start', { 
            url,
            ignoreErrors: false
        });

        // Start polling for this stream
        startPolling(response.data.id);

        // Store channel info and original URL for this stream
        if (response.data.id) {
            activeStreamsInfo.set(response.data.id, {
                channelName: channelInfo ? channelInfo.name : 'Unknown Channel',
                logo: channelInfo ? channelInfo.logo : null,
                originalUrl: url,
                startTime: new Date().toISOString()
            });
            updateStreamOrder(response.data.id);
        }

        res.json(response.data);
    } catch (error) {
        console.error('Error starting stream:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/streams', async (req, res) => {
    try {
        const response = await axios.get('http://hls-proxy:8080/streams');
        const streams = response.data;
        
        // Load channels cache once for all streams
        const cache = await loadChannelsCache();
        let allChannels = [];
        Object.values(cache).forEach(({ channels }) => {
            allChannels = allChannels.concat(channels);
        });
        
        // Add channel info to streams
        let streamsWithDetails = streams.map(stream => {
            const storedInfo = activeStreamsInfo.get(stream.id) || {};
            
            // If we don't have stored info, try to find it in the channels cache
            if (!storedInfo.channelName) {
                const channel = allChannels.find(ch => ch.url === stream.url);
                if (channel) {
                    storedInfo.channelName = channel.name;
                    storedInfo.logo = channel.logo;
                    storedInfo.originalUrl = channel.url;
                    // Store for future use
                    activeStreamsInfo.set(stream.id, storedInfo);
                }
            }

            return {
                ...stream,
                channelName: storedInfo.channelName || 'Unknown Channel',
                logo: storedInfo.logo || null,
                url: storedInfo.originalUrl || stream.url,
                proxyUrl: `/stream/${stream.id}/playlist.m3u8`,
                startTime: storedInfo.startTime || stream.startTime || null,
                status: stream.status || 'unknown'
            };
        });

        // Sort streams based on streamOrder
        streamsWithDetails = streamsWithDetails.sort((a, b) => {
            const indexA = streamOrder.indexOf(a.id);
            const indexB = streamOrder.indexOf(b.id);
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        res.json(streamsWithDetails);
    } catch (error) {
        console.error('Error fetching streams:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/streams/reorder', async (req, res) => {
    try {
        const { streamIds } = req.body;
        if (!Array.isArray(streamIds)) {
            return res.status(400).json({ error: 'streamIds must be an array' });
        }
        
        // Validate that all streamIds exist in activeStreamsInfo
        const validIds = streamIds.every(id => activeStreamsInfo.has(id));
        if (!validIds) {
            return res.status(400).json({ error: 'Invalid stream ID in order array' });
        }

        // Update the stream order
        streamOrder = streamIds;
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error reordering streams:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/streams/:id/stop', async (req, res) => {
    try {
        await axios.post(`http://hls-proxy:8080/stop/${req.params.id}`);
        stopPolling(req.params.id);
        activeStreamsInfo.delete(req.params.id);
        updateStreamOrder(req.params.id, true);
        res.json({ success: true });
    } catch (error) {
        console.error('Error stopping stream:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/streams/:id', async (req, res) => {
    try {
        const streamId = req.params.id;
        
        // First stop the stream
        await axios.post(`http://hls-proxy:8080/stop/${streamId}`);
        
        // Then delete it from HLS proxy
        await axios.delete(`http://hls-proxy:8080/stream/${streamId}`);
        
        // Clean up our stored info and update order
        activeStreamsInfo.delete(streamId);
        updateStreamOrder(streamId, true);
        stopPolling(streamId);

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting stream:', error);
        res.status(500).json({ error: error.message || 'Failed to delete stream' });
    }
});

app.post('/api/streams/:id/restart', async (req, res) => {
    const { ignoreErrors } = req.body;
    try {
        const response = await axios.post(`http://hls-proxy:8080/restart/${req.params.id}`, {
            ignoreErrors
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function to find channel by URL
function findChannelByUrl(cache, url) {
    for (const [providerId, providerData] of Object.entries(cache)) {
        const channel = providerData.channels.find(ch => ch.url === url);
        if (channel) {
            return { ...channel, providerId };
        }
    }
    return null;
}

// Initialize data directory
ensureDataDir();

// Create HTTP server
const server = app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log('New WebSocket connection');
      connectedClients.add(ws);

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        connectedClients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectedClients.delete(ws);
      });
    });
  } else {
    socket.destroy();
  }
});

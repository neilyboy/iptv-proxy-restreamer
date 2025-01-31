import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  IconButton,
  Checkbox,
  FormControlLabel,
  Avatar,
  LinearProgress,
  Chip,
  Snackbar,
  Alert,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import TvIcon from '@mui/icons-material/Tv';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import axios from 'axios';
import VideoPlayer from './VideoPlayer';
import streamWebSocket from '../utils/StreamWebSocket';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

function Streams() {
  const [streams, setStreams] = useState([]);
  const [streamStats, setStreamStats] = useState({});
  const [newStreamUrl, setNewStreamUrl] = useState('');
  const [error, setError] = useState(null);
  const [selectedStream, setSelectedStream] = useState(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, 5000);

    // Connect to WebSocket for real-time updates
    streamWebSocket.connect();
    const unsubscribe = streamWebSocket.subscribe(handleStreamUpdate);

    return () => {
      clearInterval(interval);
      unsubscribe();
      streamWebSocket.disconnect();
    };
  }, []);

  const handleStreamUpdate = (data) => {
    if (data.type === 'stream_stats') {
      setStreamStats(prevStats => ({
        ...prevStats,
        [data.streamId]: {
          ...prevStats[data.streamId],
          ...data.stats,
          lastUpdate: new Date().toISOString()
        }
      }));
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(streams);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update local state immediately for smooth UI
    setStreams(items);

    // Send new order to backend
    const streamIds = items.map(stream => stream.id);
    try {
      await axios.post('/api/streams/reorder', { streamIds });
      // Fetch streams again to ensure order is preserved
      await fetchStreams();
    } catch (err) {
      console.error('Error reordering streams:', err);
      // Revert to previous order on error by fetching again
      fetchStreams();
    }
  };

  const handleImageError = (event) => {
    event.target.src = ''; // Clear the broken image
    event.target.style.display = 'none'; // Hide the img element
    event.target.parentElement.querySelector('svg').style.display = 'block'; // Show fallback icon
  };

  const exportM3U = () => {
    let m3uContent = '#EXTM3U\n';
    
    streams.forEach(stream => {
      m3uContent += `#EXTINF:-1 tvg-name="${stream.channelName}"${stream.logo ? ` tvg-logo="${stream.logo}"` : ''}, ${stream.channelName}\n`;
      m3uContent += `${getStreamUrl(stream)}\n`;
    });

    const blob = new Blob([m3uContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'playlist.m3u';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const fetchStreams = async () => {
    try {
      const response = await axios.get('/api/streams');
      console.log('Fetched streams:', response.data);
      setStreams(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching streams:', err);
      setError('Failed to fetch streams');
    }
  };

  const startStream = async () => {
    if (!newStreamUrl) return;

    try {
      await axios.post('/api/streams', { url: newStreamUrl });
      setNewStreamUrl('');
      fetchStreams();
      showSnackbar('Stream started successfully', 'success');
    } catch (err) {
      showSnackbar('Failed to start stream', 'error');
      console.error('Error starting stream:', err);
    }
  };

  const toggleStream = async (stream) => {
    try {
      if (stream.status === 'running') {
        await axios.post(`/api/streams/${stream.id}/stop`);
        showSnackbar('Stream stopped successfully', 'success');
      } else {
        await axios.post(`/api/streams/${stream.id}/restart`, {
          ignoreErrors: stream.ignoreErrors
        });
        showSnackbar('Stream restarted successfully', 'success');
      }
      fetchStreams();
    } catch (err) {
      showSnackbar(`Failed to ${stream.status === 'running' ? 'stop' : 'restart'} stream`, 'error');
      console.error('Error toggling stream:', err);
    }
  };

  const deleteStream = async (id) => {
    try {
      await axios.delete(`/api/streams/${id}`);
      fetchStreams();
      showSnackbar('Stream deleted successfully', 'success');
    } catch (err) {
      showSnackbar('Failed to delete stream', 'error');
      console.error('Error deleting stream:', err);
    }
  };

  const toggleIgnoreErrors = async (stream) => {
    try {
      setStreams(prevStreams => 
        prevStreams.map(s => 
          s.id === stream.id 
            ? { ...s, ignoreErrors: !s.ignoreErrors, status: 'restarting' }
            : s
        )
      );

      const response = await axios.post(`/api/streams/${stream.id}/restart`, {
        ignoreErrors: !stream.ignoreErrors
      });
      console.log('Restart response:', response.data);
      
      await fetchStreams();
      showSnackbar('Stream settings updated successfully', 'success');
    } catch (err) {
      console.error('Error in toggleIgnoreErrors:', err);
      showSnackbar('Failed to update stream settings', 'error');
      
      setStreams(prevStreams => 
        prevStreams.map(s => 
          s.id === stream.id 
            ? { ...s, ignoreErrors: stream.ignoreErrors }
            : s
        )
      );
    }
  };

  const getStreamUrl = (stream) => {
    if (!stream) return '';
    // Get the base URL from the current window location
    const baseUrl = `${window.location.protocol}//${window.location.hostname}:8080`;
    // Ensure the proxyUrl starts with a forward slash
    const proxyUrl = stream.proxyUrl.startsWith('/') ? stream.proxyUrl : `/${stream.proxyUrl}`;
    return `${baseUrl}${proxyUrl}`;
  };

  const formatStartTime = (startTime) => {
    if (!startTime) return 'Not started';
    return new Date(startTime).toLocaleString();
  };

  const testStreamDirectly = async (stream) => {
    if (!stream) return;
    
    const streamUrl = getStreamUrl(stream);
    console.log('Testing stream URL:', streamUrl);
    
    try {
      // Test playlist.m3u8
      const playlistResponse = await fetch(streamUrl);
      console.log('Playlist Response:', {
        status: playlistResponse.status,
        contentType: playlistResponse.headers.get('content-type'),
      });
      
      if (!playlistResponse.ok) {
        console.error('Failed to fetch playlist:', playlistResponse.statusText);
        return;
      }
      
      const playlistContent = await playlistResponse.text();
      console.log('Playlist Content:', playlistContent);
      
      // Try to fetch the first segment if we got a playlist
      const lines = playlistContent.split('\n');
      const segmentLine = lines.find(line => line.endsWith('.ts'));
      
      if (segmentLine) {
        const segmentUrl = new URL(segmentLine, streamUrl).href;
        console.log('Testing segment URL:', segmentUrl);
        
        const segmentResponse = await fetch(segmentUrl);
        console.log('Segment Response:', {
          status: segmentResponse.status,
          contentType: segmentResponse.headers.get('content-type'),
          size: segmentResponse.headers.get('content-length'),
        });
      }
    } catch (error) {
      console.error('Stream test error:', error);
    }
  };

  const openStreamPlayer = (stream) => {
    testStreamDirectly(stream);
    setSelectedStream(stream);
    setPlayerOpen(true);
  };

  const getStreamStatus = (stream) => {
    const stats = streamStats[stream.id];
    if (!stats) return { icon: null, color: 'default', text: stream.status || 'unknown' };

    if (stats.error) {
      return { 
        icon: <ErrorIcon />, 
        color: 'error',
        text: 'Error: ' + stats.error
      };
    }

    if (stats.warning) {
      return {
        icon: <WarningIcon />,
        color: 'warning',
        text: stats.warning
      };
    }

    if (stream.status === 'running' && stats.currentSegment) {
      return {
        icon: <CheckCircleIcon />,
        color: 'success',
        text: 'Running'
      };
    }

    return {
      icon: null,
      color: 'default',
      text: stream.status || 'unknown'
    };
  };

  const getStreamStats = (stream) => {
    const stats = streamStats[stream.id];
    if (!stats) return null;

    return (
      <Box sx={{ mt: 1 }}>
        {stats.currentSegment && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Current Segment: {stats.currentSegment}
            </Typography>
            {stats.segmentDuration && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={(stats.segmentProgress || 0) * 100} 
                  sx={{ flexGrow: 1 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {Math.round(stats.segmentProgress * 100)}%
                </Typography>
              </Box>
            )}
          </Box>
        )}
        
        {stats.bitrate && (
          <Typography variant="body2" color="text.secondary">
            Bitrate: {(stats.bitrate / 1000000).toFixed(2)} Mbps
          </Typography>
        )}
        
        {stats.bufferHealth && (
          <Typography variant="body2" color="text.secondary">
            Buffer Health: {stats.bufferHealth}s
          </Typography>
        )}

        {stats.lastError && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            Last Error: {stats.lastError}
          </Typography>
        )}
        
        {stats.lastUpdate && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Last Update: {new Date(stats.lastUpdate).toLocaleString()}
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Active Streams
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<FileDownloadIcon />}
            onClick={exportM3U}
          >
            Export M3U
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<RefreshIcon />}
            onClick={fetchStreams}
          >
            REFRESH
          </Button>
        </Box>
      </Box>

      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          label="Stream URL"
          variant="outlined"
          value={newStreamUrl}
          onChange={(e) => setNewStreamUrl(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          color="primary"
          startIcon={<PlayArrowIcon />}
          onClick={startStream}
          disabled={!newStreamUrl}
        >
          START STREAM
        </Button>
      </Box>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="streams">
          {(provided) => (
            <Box
              {...provided.droppableProps}
              ref={provided.innerRef}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              {streams.map((stream, index) => {
                const status = getStreamStatus(stream);
                return (
                  <Draggable key={stream.id} draggableId={stream.id} index={index}>
                    {(provided) => (
                      <Paper
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        elevation={3}
                        sx={{
                          p: 2,
                          mb: 2,
                          backgroundColor: '#1e1e1e',
                          color: 'white',
                          cursor: 'grab',
                          '&:active': { cursor: 'grabbing' }
                        }}
                      >
                        <Box sx={{ mb: 1, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                          {stream.logo ? (
                            <Avatar
                              src={stream.logo}
                              alt={stream.channelName}
                              variant="rounded"
                              sx={{ width: 48, height: 48 }}
                              imgProps={{ onError: handleImageError }}
                            >
                              <TvIcon />
                            </Avatar>
                          ) : (
                            <Avatar
                              variant="rounded"
                              sx={{ width: 48, height: 48, bgcolor: 'primary.main' }}
                            >
                              <TvIcon />
                            </Avatar>
                          )}
                          <Box sx={{ flexGrow: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Typography variant="h6" component="div">
                                {stream.channelName || `Stream ${stream.id}`}
                              </Typography>
                              <Chip
                                icon={status.icon}
                                label={status.text}
                                color={status.color}
                                size="small"
                                sx={{ ml: 1 }}
                              />
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ color: '#888' }}>
                              Original URL: {stream.url}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ color: '#888' }}>
                              Stream URL: {getStreamUrl(stream)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ color: '#888' }}>
                              Started: {formatStartTime(stream.startTime)}
                            </Typography>
                            {getStreamStats(stream)}
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={!!stream.ignoreErrors}
                                  onChange={() => toggleIgnoreErrors(stream)}
                                  size="small"
                                />
                              }
                              label="Ignore Errors"
                            />
                            <Button
                              variant="outlined"
                              color="primary"
                              startIcon={<PlayCircleOutlineIcon />}
                              onClick={() => openStreamPlayer(stream)}
                              disabled={stream.status !== 'running'}
                              size="small"
                              sx={{ minWidth: '120px' }}
                            >
                              Test Stream
                            </Button>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <IconButton
                              color="primary"
                              onClick={() => toggleStream(stream)}
                            >
                              {stream.status === 'running' ? <StopIcon /> : <PlayArrowIcon />}
                            </IconButton>
                            <IconButton
                              color="error"
                              onClick={() => deleteStream(stream.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Box>
                        </Box>
                      </Paper>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </Box>
          )}
        </Droppable>
      </DragDropContext>

      <VideoPlayer
        open={playerOpen}
        onClose={() => {
          setPlayerOpen(false);
          setSelectedStream(null);
        }}
        streamUrl={selectedStream ? getStreamUrl(selectedStream) : ''}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Streams;

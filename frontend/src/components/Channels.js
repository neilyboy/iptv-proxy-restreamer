import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  IconButton,
  TextField,
  Typography,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Snackbar,
  Alert,
  Avatar,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import TvIcon from '@mui/icons-material/Tv';
import { FixedSizeGrid as VirtualGrid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import debounce from 'lodash/debounce';

// Image dimensions
const LOGO_HEIGHT = 80;
const CARD_HEIGHT = 160;
const CARD_MIN_WIDTH = 250;

function ChannelCard({ channel, onStartStream }) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  return (
    <Card sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      bgcolor: '#1e1e1e', 
      color: 'white',
    }}>
      <Box sx={{ 
        position: 'relative', 
        width: '100%', 
        height: LOGO_HEIGHT, 
        bgcolor: 'black', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        {!imageError && channel.logo ? (
          <>
            {!imageLoaded && (
              <CircularProgress size={20} sx={{ position: 'absolute' }} />
            )}
            <CardMedia
              component="img"
              height={LOGO_HEIGHT}
              image={channel.logo}
              alt={channel.name}
              sx={{ 
                objectFit: 'contain',
                opacity: imageLoaded ? 1 : 0,
                transition: 'opacity 0.3s'
              }}
              onError={handleImageError}
              onLoad={handleImageLoad}
              loading="lazy"
            />
          </>
        ) : (
          <Avatar
            variant="rounded"
            sx={{ width: 50, height: 50, bgcolor: 'primary.main' }}
          >
            <TvIcon sx={{ fontSize: 30 }} />
          </Avatar>
        )}
      </Box>
      <CardContent sx={{ flexGrow: 1, p: 1 }}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start' 
        }}>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="subtitle1" noWrap title={channel.name}>
              {channel.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {channel.group}
            </Typography>
          </Box>
          <IconButton
            onClick={() => onStartStream(channel)}
            color="primary"
            size="small"
            sx={{ ml: 1 }}
          >
            <PlayArrowIcon />
          </IconButton>
        </Box>
      </CardContent>
    </Card>
  );
}

function VirtualChannelGrid({ channels, onStartStream }) {
  const theme = useTheme();
  const GRID_SPACING = 16; // 16px spacing between cards

  const getColumnCount = useCallback((width) => {
    const availableWidth = width - GRID_SPACING * 2; // Account for outer padding
    const cardWidth = CARD_MIN_WIDTH + GRID_SPACING; // Account for card padding
    return Math.max(1, Math.floor(availableWidth / cardWidth));
  }, []);

  const Cell = useCallback(({ columnIndex, rowIndex, style, data }) => {
    const { width, channels, columnCount } = data;
    const index = (rowIndex * columnCount) + columnIndex;
    
    if (index >= channels.length) return null;
    
    const channel = channels[index];
    
    return (
      <div style={{
        ...style,
        padding: GRID_SPACING / 2,
      }}>
        <ChannelCard channel={channel} onStartStream={onStartStream} />
      </div>
    );
  }, [onStartStream]);

  return (
    <Box 
      sx={{ 
        height: 'calc(100vh - 250px)', 
        width: '100%',
        padding: `${GRID_SPACING}px`,
        '& ::-webkit-scrollbar': {
          width: '8px',
          height: '8px',
          backgroundColor: '#1e1e1e',
        },
        '& ::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: '4px',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
          },
        },
        '& ::-webkit-scrollbar-track': {
          backgroundColor: 'transparent',
        },
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255, 255, 255, 0.2) transparent',
      }}
    >
      <AutoSizer>
        {({ height, width }) => {
          const columnCount = getColumnCount(width);
          const rowCount = Math.ceil(channels.length / columnCount);
          const columnWidth = Math.floor((width - GRID_SPACING * 2) / columnCount);
          
          return (
            <VirtualGrid
              columnCount={columnCount}
              columnWidth={columnWidth}
              height={height}
              rowCount={rowCount}
              rowHeight={CARD_HEIGHT}
              width={width}
              style={{
                overflowX: 'hidden',
                overflowY: 'scroll',
              }}
              itemData={{
                width,
                channels,
                columnCount,
              }}
            >
              {Cell}
            </VirtualGrid>
          );
        }}
      </AutoSizer>
    </Box>
  );
}

function Channels() {
  const [channels, setChannels] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedGroup) params.append('group', selectedGroup);

      const response = await axios.get(`/api/channels?${params.toString()}`);
      setChannels(response.data);
    } catch (error) {
      console.error('Error fetching channels:', error);
      showSnackbar('Error fetching channels', 'error');
    } finally {
      setLoading(false);
    }
  };

  const debouncedFetchChannels = useMemo(
    () => debounce(() => {
      fetchChannels();
    }, 300),
    [searchQuery, selectedGroup] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    fetchChannels();
    fetchGroups();
  }, []);

  useEffect(() => {
    debouncedFetchChannels();
    return () => debouncedFetchChannels.cancel();
  }, [debouncedFetchChannels]);

  const fetchGroups = async () => {
    try {
      const response = await axios.get('/api/channels/groups');
      setGroups(response.data);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  const handleStartStream = async (channel) => {
    try {
      await axios.post('/api/streams', { url: channel.url });
      showSnackbar('Stream started successfully', 'success');
    } catch (error) {
      console.error('Error starting stream:', error);
      showSnackbar('Error starting stream', 'error');
    }
  };

  const handleRefreshProvider = async (providerId) => {
    try {
      await axios.post(`/api/providers/${providerId}/refresh`);
      showSnackbar('Channels refreshed successfully', 'success');
      fetchChannels();
    } catch (error) {
      console.error('Error refreshing channels:', error);
      showSnackbar('Error refreshing channels', 'error');
    }
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleGroupChange = (e) => {
    setSelectedGroup(e.target.value);
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Channels
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Search Channels"
              value={searchQuery}
              onChange={handleSearchChange}
              InputProps={{
                endAdornment: (
                  <IconButton size="small" disabled={loading}>
                    {loading ? <CircularProgress size={20} /> : <SearchIcon />}
                  </IconButton>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>Filter by Group</InputLabel>
              <Select
                value={selectedGroup}
                label="Filter by Group"
                onChange={handleGroupChange}
                disabled={loading}
              >
                <MenuItem value="">All Groups</MenuItem>
                {groups.map((group) => (
                  <MenuItem key={group} value={group}>
                    {group}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
              onClick={fetchChannels}
              disabled={loading}
            >
              Refresh
            </Button>
          </Grid>
        </Grid>
      </Box>

      {loading && channels.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <VirtualChannelGrid channels={channels} onStartStream={handleStartStream} />
      )}

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

export default Channels;

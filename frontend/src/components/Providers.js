import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
  Grid,
  CircularProgress,
  Snackbar,
  Alert,
  LinearProgress,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';

function Providers() {
  const [providers, setProviders] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [newProvider, setNewProvider] = useState({
    name: '',
    m3uUrl: '',
    username: '',
    password: '',
  });

  useEffect(() => {
    fetchProviders();
  }, []);

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const fetchProviders = async () => {
    try {
      const response = await axios.get('/api/providers');
      setProviders(response.data);
    } catch (error) {
      console.error('Error fetching providers:', error);
      showSnackbar('Error fetching providers', 'error');
    }
  };

  const handleAddProvider = async () => {
    setLoading(true);
    setLoadingProgress(0);
    try {
      const response = await axios.post('/api/providers', newProvider);
      
      // Start polling for channel parsing progress
      const pollProgress = setInterval(async () => {
        try {
          const statusResponse = await axios.get(`/api/providers/${response.data.id}/status`);
          const progress = statusResponse.data.progress;
          setLoadingProgress(progress);
          
          if (progress === 100) {
            clearInterval(pollProgress);
            setLoading(false);
            setLoadingProgress(null);
            setOpen(false);
            setNewProvider({ name: '', m3uUrl: '', username: '', password: '' });
            fetchProviders();
            showSnackbar('Provider added successfully', 'success');
          }
        } catch (error) {
          console.error('Error polling progress:', error);
        }
      }, 1000);

      // Set a timeout to stop polling after 30 seconds
      setTimeout(() => {
        clearInterval(pollProgress);
        if (loading) {
          setLoading(false);
          setLoadingProgress(null);
          showSnackbar('Provider added, but channel parsing is taking longer than expected', 'warning');
        }
      }, 30000);

    } catch (error) {
      console.error('Error adding provider:', error);
      setLoading(false);
      setLoadingProgress(null);
      showSnackbar('Error adding provider', 'error');
    }
  };

  const handleDeleteProvider = async (id) => {
    try {
      await axios.delete(`/api/providers/${id}`);
      fetchProviders();
      showSnackbar('Provider deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting provider:', error);
      showSnackbar('Error deleting provider', 'error');
    }
  };

  const handleRefreshProvider = async (id) => {
    try {
      setProviders(prevProviders => 
        prevProviders.map(p => 
          p.id === id ? { ...p, isRefreshing: true } : p
        )
      );

      // First refresh the provider
      const response = await axios.post(`/api/providers/${id}/refresh`);
      console.log('Refresh response:', response.data);
      
      // Then get the updated provider data
      const { data: updatedProviders } = await axios.get('/api/providers');
      console.log('Updated providers:', updatedProviders);
      
      setProviders(updatedProviders.map(p => ({
        ...p,
        isRefreshing: false
      })));
      
      showSnackbar(`Provider refreshed successfully. Found ${response.data.channelCount} channels.`, 'success');
    } catch (error) {
      console.error('Error refreshing provider:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Error refreshing provider';
      
      setProviders(prevProviders => 
        prevProviders.map(p => 
          p.id === id ? { ...p, isRefreshing: false } : p
        )
      );
      
      showSnackbar(errorMessage, 'error');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Never';
      return date.toLocaleString();
    } catch (error) {
      return 'Never';
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">M3U Providers</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpen(true)}
        >
          Add Provider
        </Button>
      </Box>

      <Grid container spacing={3}>
        {providers.map((provider) => (
          <Grid item xs={12} sm={6} md={4} key={provider.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6" component="div">
                    {provider.name}
                  </Typography>
                  <Box>
                    <IconButton 
                      onClick={() => handleRefreshProvider(provider.id)}
                      disabled={provider.isRefreshing}
                      sx={{ color: 'primary.main', mr: 1 }}
                    >
                      <RefreshIcon sx={{ 
                        animation: provider.isRefreshing ? 'spin 1s linear infinite' : 'none',
                        '@keyframes spin': {
                          '0%': { transform: 'rotate(0deg)' },
                          '100%': { transform: 'rotate(360deg)' }
                        }
                      }} />
                    </IconButton>
                    <IconButton
                      onClick={() => handleDeleteProvider(provider.id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                  {provider.url}
                </Typography>
                {provider.username && (
                  <Typography variant="body2" color="text.secondary">
                    Username: {provider.username}
                  </Typography>
                )}
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  Last Updated: {formatDate(provider.lastUpdated)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={open} onClose={() => !loading && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Provider</DialogTitle>
        <DialogContent>
          {loading && (
            <Box sx={{ width: '100%', mt: 2 }}>
              <LinearProgress 
                variant={loadingProgress !== null ? "determinate" : "indeterminate"} 
                value={loadingProgress || 0}
              />
              <Typography variant="caption" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                {loadingProgress !== null 
                  ? `Parsing channels... ${loadingProgress}%`
                  : 'Adding provider...'}
              </Typography>
            </Box>
          )}
          <TextField
            autoFocus
            margin="dense"
            label="Provider Name"
            fullWidth
            value={newProvider.name}
            onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
            disabled={loading}
          />
          <TextField
            margin="dense"
            label="M3U URL"
            fullWidth
            value={newProvider.m3uUrl}
            onChange={(e) => setNewProvider({ ...newProvider, m3uUrl: e.target.value })}
            disabled={loading}
          />
          <TextField
            margin="dense"
            label="Username (optional)"
            fullWidth
            value={newProvider.username}
            onChange={(e) => setNewProvider({ ...newProvider, username: e.target.value })}
            disabled={loading}
          />
          <TextField
            margin="dense"
            label="Password (optional)"
            type="password"
            fullWidth
            value={newProvider.password}
            onChange={(e) => setNewProvider({ ...newProvider, password: e.target.value })}
            disabled={loading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
          <Button 
            onClick={handleAddProvider} 
            disabled={loading || !newProvider.name || !newProvider.m3uUrl}
            startIcon={loading && <CircularProgress size={20} />}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Providers;

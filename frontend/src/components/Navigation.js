import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ListAltIcon from '@mui/icons-material/ListAlt';
import TvIcon from '@mui/icons-material/Tv';

function Navigation() {
  return (
    <AppBar position="fixed">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          HLS Proxy Manager
        </Typography>
        <Button
          color="inherit"
          component={RouterLink}
          to="/"
          startIcon={<ListAltIcon />}
        >
          Providers
        </Button>
        <Button
          color="inherit"
          component={RouterLink}
          to="/channels"
          startIcon={<TvIcon />}
        >
          Channels
        </Button>
        <Button
          color="inherit"
          component={RouterLink}
          to="/streams"
          startIcon={<PlayCircleOutlineIcon />}
        >
          Streams
        </Button>
      </Toolbar>
    </AppBar>
  );
}

export default Navigation;

import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import Hls from 'hls.js';
import { Dialog, DialogContent, IconButton, DialogTitle, Box, Typography, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

function VideoPlayer({ open, onClose, streamUrl }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [error, setError] = useState(null);
  const [mounted, setMounted] = useState(false);
  const eventHandlersRef = useRef({});

  // Use layout effect to track when component is mounted
  useLayoutEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Cleanup function for HLS instance
  const cleanupHls = () => {
    const video = videoRef.current;
    if (video) {
      Object.entries(eventHandlersRef.current).forEach(([event, handler]) => {
        video.removeEventListener(event, handler);
      });
      video.removeAttribute('src');
      video.load();
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  };

  // Main effect for player initialization
  useEffect(() => {
    // Don't initialize until component is mounted and dialog is open
    if (!mounted || !open || !streamUrl) {
      return;
    }

    // Clean up any existing instance
    cleanupHls();
    setError(null);

    // Wait a bit for the Dialog to fully mount
    const initTimeout = setTimeout(() => {
      const video = videoRef.current;
      if (!video) {
        console.error('Video element not found after delay');
        return;
      }

      let hls = null;

      // Setup event handlers
      eventHandlersRef.current = {
        playing: () => setError(null),
        error: () => {
          const err = video.error;
          console.error('Video error:', err);
          setError(`Video Error: ${err?.message || 'Unknown error'}`);
        }
      };

      try {
        if (Hls.isSupported()) {
          // Create new HLS instance
          hls = new Hls({
            debug: false,
            enableWorker: true,
            startLevel: 0,
            autoStartLoad: true,
            manifestLoadingTimeOut: 10000,
            manifestLoadingMaxRetry: 2,
            levelLoadingTimeOut: 10000,
            levelLoadingMaxRetry: 2,
            fragLoadingTimeOut: 10000,
            fragLoadingMaxRetry: 2,
          });
          hlsRef.current = hls;

          // Setup event handlers
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.error('Network error:', data);
                  setError('Network error - retrying...');
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.error('Media error:', data);
                  setError('Media error - recovering...');
                  hls.recoverMediaError();
                  break;
                default:
                  console.error('Fatal HLS error:', data);
                  setError(`Playback error: ${data.details}`);
                  break;
              }
            }
          });

          // Add event listeners
          Object.entries(eventHandlersRef.current).forEach(([event, handler]) => {
            video.addEventListener(event, handler);
          });

          // Attach to video and load source
          hls.attachMedia(video);

          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            console.log('Loading stream URL:', streamUrl);
            hls.loadSource(streamUrl);
          });

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('Manifest parsed, attempting playback');
            const playPromise = video.play();
            if (playPromise) {
              playPromise.catch(e => {
                console.warn('Autoplay prevented:', e);
                setError('Click play to start video');
              });
            }
          });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Fallback to native HLS for Safari
          video.src = streamUrl;
          video.addEventListener('loadedmetadata', () => {
            const playPromise = video.play();
            if (playPromise) {
              playPromise.catch(e => {
                console.warn('Native playback failed:', e);
                setError('Click play to start video');
              });
            }
          });
        } else {
          setError('HLS playback not supported in this browser');
        }
      } catch (err) {
        console.error('Player setup failed:', err);
        setError(`Setup failed: ${err.message}`);
      }

      return () => {
        clearTimeout(initTimeout);
        cleanupHls();
      };
    }, 100);

    return () => {
      clearTimeout(initTimeout);
    };
  }, [mounted, open, streamUrl]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: '#1e1e1e',
          color: 'white'
        }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Stream Preview
        <IconButton
          onClick={onClose}
          sx={{
            color: 'white',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ width: '100%', aspectRatio: '16/9', bgcolor: '#000', position: 'relative' }}>
          <video
            ref={videoRef}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#000'
            }}
            controls
            playsInline
            autoPlay
          />
          {error && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 16,
                left: 16,
                right: 16,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 1,
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 2
              }}
            >
              <Typography color="error" sx={{ flex: 1 }}>
                {error}
              </Typography>
              <Button
                variant="contained"
                color="primary"
                size="small"
                onClick={() => {
                  setError(null);
                  const video = videoRef.current;
                  if (!video) return;

                  if (hlsRef.current) {
                    hlsRef.current.stopLoad();
                    hlsRef.current.startLoad();
                  } else {
                    video.load();
                    video.play().catch(console.error);
                  }
                }}
              >
                Retry
              </Button>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default VideoPlayer;

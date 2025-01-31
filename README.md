# HLS Proxy Manager

A modern web application for managing IPTV/M3U providers and streams with HLS proxy support.

## Features

### Provider Management
- Add and manage multiple M3U providers
- Support for authenticated M3U URLs (username/password)
- Real-time provider refresh with status updates
- Last updated timestamp tracking for each provider
- Easy provider deletion

### Channel Management
- Automatic channel parsing from M3U playlists
- Channel grouping support
- Channel logos and EPG ID support
- Channel search functionality
- Filter channels by group
- Refresh channel list on demand

### Stream Management
- Drag-and-drop stream reordering
- Export customized M3U playlists
- HLS proxy support for improved playback
- Stream status monitoring

### User Interface
- Modern, responsive Material-UI design
- Real-time status updates and notifications
- Dark theme for better visibility
- Loading indicators for async operations

## Project Structure
```
hls-proxy-manager/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/      # React components
│   │   └── App.js          # Main application component
│   ├── package.json        # Frontend dependencies
│   └── nginx.conf          # Nginx configuration
├── backend/                 # Node.js backend server
│   ├── src/
│   │   └── index.js       # Main server file
│   └── package.json       # Backend dependencies
├── hls-proxy/              # HLS proxy service
└── docker-compose.yml      # Docker compose configuration
```

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   # Frontend
   cd frontend
   npm install

   # Backend
   cd backend
   npm install
   ```

3. Start the services:
   ```bash
   docker-compose up -d
   ```

The application will be available at:
- Frontend: http://localhost:80
- Backend API: http://localhost:3000
- HLS Proxy: http://localhost:8080

## Development

### Frontend Development
```bash
cd frontend
npm start
```

### Backend Development
```bash
cd backend
npm start
```

## Docker Support
The application is fully dockerized with three services:
- Frontend (Nginx)
- Backend (Node.js)
- HLS Proxy

Use `docker-compose up -d` to start all services.

## Configuration
- Frontend port: 80
- Backend port: 3000
- HLS Proxy port: 8080

Data is persisted in the backend's data directory.

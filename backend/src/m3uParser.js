const axios = require('axios');

class M3UParser {
    static async parse(url, username = '', password = '') {
        try {
            let finalUrl = url;
            if (username && password) {
                // Insert credentials into URL if provided
                const urlObj = new URL(url);
                urlObj.username = username;
                urlObj.password = password;
                finalUrl = urlObj.toString();
            }

            const response = await axios.get(finalUrl);
            const content = response.data;
            const channels = [];
            let currentChannel = null;

            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line.startsWith('#EXTINF:')) {
                    // Parse channel info
                    currentChannel = {
                        name: '',
                        group: '',
                        logo: '',
                        url: ''
                    };

                    // Extract channel name and attributes
                    const infoMatch = line.match(/#EXTINF:[-]?\d+\s*(.+)$/);
                    if (infoMatch) {
                        const attributes = infoMatch[1];
                        
                        // Extract group-title
                        const groupMatch = attributes.match(/group-title="([^"]+)"/);
                        if (groupMatch) {
                            currentChannel.group = groupMatch[1];
                        }

                        // Extract tvg-logo
                        const logoMatch = attributes.match(/tvg-logo="([^"]+)"/);
                        if (logoMatch) {
                            currentChannel.logo = logoMatch[1];
                        }

                        // Extract channel name (last part after the last comma)
                        const nameParts = attributes.split(',');
                        if (nameParts.length > 0) {
                            currentChannel.name = nameParts[nameParts.length - 1].trim();
                        }
                    }
                } else if (line.startsWith('http') && currentChannel) {
                    // Add URL to current channel and save it
                    currentChannel.url = line;
                    channels.push({ ...currentChannel });
                    currentChannel = null;
                }
            }

            return channels;
        } catch (error) {
            console.error('Error parsing M3U playlist:', error);
            throw error;
        }
    }
}

module.exports = M3UParser;

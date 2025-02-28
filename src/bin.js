import open from 'open';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import os from 'os';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 30002
const IMS_STAGE = 'https://ims-na1-stg1.adobelogin.com';
const IMS_PROD = 'https://ims-na1.adobelogin.com';

const server = http.createServer(app);

/**
 * Handle the response from the token response from IMS.
 */
app.post('/token', express.json(), async (req, res) => {
  const { access_token } = req.body;
  
  // Get the home directory in a cross-platform way
  const homeDir = os.homedir();
  const filePath = path.join(homeDir, '.aem-import-helper');
  
  try {
    // Write file with appropriate permissions for the platform
    if (process.platform === 'win32') {
      // Windows: Write file first
      fs.writeFileSync(filePath, JSON.stringify({
        access_token,
        expires_in: 3600 
      }, null, 2));
      
      // Then set Windows-appropriate permissions (owner-only access)
      const { exec } = await import('child_process');
      exec(`icacls "${filePath}" /inheritance:r /grant:r "%USERNAME%":F`);
    } else {
      // Unix/Mac: Use mode flag
      fs.writeFileSync(filePath, JSON.stringify({
        access_token,
        expires_in: 3600 
      }, null, 2), { mode: 0o600 });
    }
    
    // send 200 so the fetch can resolve
    res.sendStatus(200);
    shutdownServer();
  } catch (error) {
    console.error('Error saving token:', error);
    res.sendStatus(500);
    shutdownServer(1);
  }
});


/**
 * Handle the response from the IMS, however the response includes the access_token in the hash
 * so we need to extract it and send it back to ourselves
 */
app.get('/', async (req, res) => {
  res.send(`
    <html>
      <body>
        <script>
          // Get the access token from the URL fragment
          const hash = window.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const access_token = params.get('access_token');

          // remove the hash from the url
          window.history.replaceState({}, '', window.location.pathname);
          
          // Send it to our server
          if (access_token) {
            fetch('/token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ access_token })
            }).then(() => {
              document.body.innerHTML = 'Authentication successful! You can close this window.';
            });
          }
        </script>
        Processing authentication...
      </body>
    </html>
  `);
});

function shutdownServer(code) {
  server.close(() => {
    console.log('Server closed. Process will exit.');
    process.exit(code || 0);
  });
}

// Start the server
server.listen(port);

async function main() {
  const imsUrl = process.env.ENVIRONMENT === 'stg' ? IMS_STAGE : IMS_PROD;
  const redirectURL = new URL('/ims/authorize/v3', imsUrl);
  redirectURL.searchParams.set('response_type', 'token');
  redirectURL.searchParams.set('client_id', 'aem-import-helper');
  redirectURL.searchParams.set('scope', 'AdobeID,openid');
  redirectURL.searchParams.set('locale', 'en_US');
  redirectURL.searchParams.set('redirect_uri', 'http://localhost:30002');
  redirectURL.searchParams.set('target', '_blank');
  await open(redirectURL.toString());
}

// Execute the main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  shutdownServer(1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down gracefully...');
  shutdownServer(0);
});

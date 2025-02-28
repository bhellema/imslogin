import fetch from 'node-fetch';
import open from 'open';
import express from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import keychain from 'keychain';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 30002;

const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, '../certs/localhost.key')),
  cert: fs.readFileSync(path.join(__dirname, '../certs/localhost.crt'))
};

// Create HTTPS server
const server = https.createServer(sslOptions, app);

/**
 * Handle the response from the token response from IMS.
 */
app.post('/token', express.json(), async (req, res) => {
  const { access_token } = req.body;
  
  // Save the token
  const homeDir = process.env.HOME;
  const filePath = path.join(homeDir, '.aem-import-helper');
  
  fs.writeFileSync(filePath, JSON.stringify({
    access_token,
    expires_in: 3600 // You might want to get this from the hash params too
  }, null, 2));
  
  // send 200 so the fetch can resolve
  res.sendStatus(200);
  shutdownServer();
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
  

  // if (req.query.code) {
  //   const formData = new FormData();
  //   formData.append('grant_type', 'authorization_code');
  //   formData.append('client_id', process.env.IMS_CLIENT_ID);
  //   formData.append('code', req.query.code);
  //   formData.append('client_secret', process.env.IMS_CLIENT_SECRET);
  //   formData.append('redirect_uri', process.env.IMS_REDIRECT_URI);
  //   const result = await fetch(process.env.IMS_STAGE + "/ims/token/v3", {
  //     method: 'POST',
  //     body: formData
  //   });

  //   const data = await result.json();
  //   const {
  //     access_token,
  //     refresh_token,
  //     expires_in,
  //   } = data;

  //   res.send('Authentication successful! You can close this window.');

  //  // store the access_token in the user's home directory in a file called .aem-import-helper
  //  const homeDir = process.env.HOME;
  //  const filePath = path.join(homeDir, '.aem-import-helper');

  //  if (fs.existsSync(filePath)) {
  //   fs.unlinkSync(filePath);
  //  }

  //  // save the access_token, refresh_token, and expires_in to the file as json with spaces between the properties
  //  fs.writeFileSync(filePath, JSON.stringify({
  //   access_token,
  //   refresh_token,
  //   expires_in,
  //  }, null, 2));
   
  //  console.debug('Access token saved to:', filePath);

  //  shutdownServer();
  // }
});

function shutdownServer(code) {
  server.close(() => {
    console.log('Server closed. Process will exit.');
    process.exit(code || 0);
  });
}

// Start the server
server.listen(port, () => {
  console.log(`Server running at https://localhost:${port}`);
});

async function main() {
  const redirectURL = new URL('/ims/authorize/v3', process.env.IMS_STAGE);
  // redirectURL.searchParams.set('response_type', 'code');
  redirectURL.searchParams.set('response_type', 'token');
  redirectURL.searchParams.set('client_id', process.env.IMS_CLIENT_ID);
  redirectURL.searchParams.set('scope', 'AdobeID,openid');
  redirectURL.searchParams.set('locale', 'en_US');
  // redirectURL.searchParams.set('redirect_uri', process.env.IMS_REDIRECT_URI);
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

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const TRAINING_DIR = path.join(__dirname, 'Training_data');

// Ensure directory exists
if (!fs.existsSync(TRAINING_DIR)) {
    fs.mkdirSync(TRAINING_DIR);
}

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/save') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const timestamp = new Date().getTime();
                const fileName = `traffic_q_table_${timestamp}.json`;
                const filePath = path.join(TRAINING_DIR, fileName);

                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                console.log(`Saved: ${fileName}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', path: fileName }));
            } catch (err) {
                console.error('Error saving file:', err);
                res.writeHead(500);
                res.end('Error saving file');
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`Save server running at http://localhost:${PORT}`);
    console.log(`Files will be saved to: ${TRAINING_DIR}`);
});

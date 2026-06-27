import 'dotenv/config';
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimiterForLogin, rateLimiterForRegister } from "./redisRateLimiter.js";
import { register } from "./controllers/register.js";
import { login, logout } from "./controllers/login.js";
import { allFolders, createFolder, renameFolder, deleteFolder } from "./controllers/folders.js";
import { upload, uploadFile, downloadFile, viewFile, renameFile, deleteFile, shareFile } from "./controllers/files.js";
import { getTrash, getRecentFiles, restoreItem, permanentDeleteItem } from "./controllers/dashboard.js";
import { exec } from 'child_process';

const server = express();
const PORT = 2000;

server.use(cors({
	origin: process.env.UI_URL || 'http://localhost:5173',
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	credentials: true,
}));

server.use(cookieParser());
server.use(express.json());

// Auth routes
server.put('/register', rateLimiterForRegister, register);
server.put('/login', rateLimiterForLogin, login);
server.put('/logout', logout);

// Folder routes
server.get('/allFolders', allFolders);
server.post('/createFolder', createFolder);
server.put('/renameFolder', renameFolder);
server.put('/deleteFolder', deleteFolder);

// File routes
server.post('/uploadFile', upload.single('file'), uploadFile);
server.get('/downloadFile/:fileId', downloadFile);
server.get('/viewFile/:fileId', viewFile);
server.put('/renameFile', renameFile);
server.put('/deleteFile', deleteFile);
server.post('/shareFile', shareFile);

// Dashboard / Trash routes
server.get('/trash', getTrash);
server.get('/recentFiles', getRecentFiles);
server.put('/restoreItem', restoreItem);
server.delete('/permanentDeleteItem', permanentDeleteItem);

//git actionRoutefor running ./bash script
server.post('/webhook', (req, res) => {
    // Check if the push event happened on the main branch
    const ref = req.body.ref;
    
    if (ref === 'refs/heads/main') {
        console.log('🚀 Push event detected on main branch. Triggering deployment...');

        // Execute our deployment bash script
        exec('/home/ubuntu/deploy.sh', (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Deployment Error: ${error.message}`);
                return res.status(500).send('Deployment failed');
            }
            if (stderr) {
                console.error(`⚠️ Script Stderr: ${stderr}`);
            }
            console.log(`✅ Script Stdout:\n${stdout}`);
            return res.status(200).send('Deployment successful');
        });
    } else {
        res.status(200).send('Ignored: Not the main branch.');
    }
});
server.listen(PORT, () => {
    console.log(`server started on port ${PORT}`);
});

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

const server = express();
const PORT = 2000;

server.use(cors({
	origin: 'http://localhost:5173',
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

server.listen(PORT, () => {
    console.log(`server started on port ${PORT}`);
});

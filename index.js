import express from "express"
import cors from "cors"
import bcrypt from 'bcrypt'
import cookieParser from "cookie-parser"
import mongoose from 'mongoose'
import { rateLimiterForLogin, rateLimiterForRegister } from "./redisRateLimiter.js"
import { register } from "./controllers/register.js"
import { login } from "./controllers/login.js"
import { allFolders } from "./controllers/folders.js"
const server = express()
const PORT=2000
const saltRounds=10
server.use(cors({
	origin:'http://localhost:5173',
	methods:['PUT'],
	credentials:true,
}))
server.use(cookieParser())
server.use(express.json())
server.put('/register',rateLimiterForRegister,register)
server.put('/login',rateLimiterForLogin,login)
server.get('/allFolders',allFolders)
server.listen(PORT,()=>{
console.log(`server started on port ${PORT}`)
})

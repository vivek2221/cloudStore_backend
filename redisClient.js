import { createClient } from "redis";
const redisClient=createClient({
    url:'redis://localhost:6379'
})
redisClient.on('error',(err)=>console.log(`some err had occured - ${err.message}`))
redisClient.on('connect',()=>console.log(`redis connected successfully`))
await redisClient.connect()
export {redisClient}
import { redisClient } from "./redisClient.js";

async function rateLimiter(req,res,next,key,limitNumber,errorMessage,timeToRefresh){
     const ip=req.ip || req.headers['x-forwarded-for']
    const redisKey=`${key}:${ip}`
    try{
      const request=await redisClient.incr(redisKey)
      if(request==1){
        await redisClient.expire(redisKey,timeToRefresh)
      }
      if(request>=limitNumber){
      return  res.status(409).json({error:errorMessage})
      }
    }catch(err){
      console.log('error in redis - ',err.message)
      
    }finally{
     next()
    }
}
const rateLimiterForRegister=async (req,res,next)=>{
    rateLimiter(req,res,next,'rate_limit_register',5,'too many request for register try after 1 hour',3600)
}
const rateLimiterForLogin=async (req,res,next)=>{
    rateLimiter(req,res,next,'rate_limit_login',50,'too many request for login try after 15 minutes',900)
}
export {
    rateLimiterForLogin,
    rateLimiterForRegister}
import { redisClient } from "../redisClient.js";
import bcrypt from 'bcrypt'
import { generateAccessToken, generateRefreshToken, verifyToken } from "../tokensCreation.js";
import { modelUserData } from "../mongooseSchema.js";
import 'dotenv/config'

async function newTokenAssigning(redisRefreshTokenIsExisting,refreshToken,redisClient,res){
                refreshToken=generateRefreshToken(verifyToken(refreshToken))
                let accessToken=generateAccessToken(verifyToken(redisClient))
                await redisClient.del(redisRefreshTokenIsExisting)
                await redisClient.set(refreshToken,'activeRefreshToken')
                const folderId=await modelUserData.findOne({_id:verifyToken(accessToken).userId})
                res.cookie('refreshToken',refreshToken,{
                    maxAge:1000*60*60*24*7,
                    httpOnly: true,
                    secure: true,
                    sameSite: 'strict'
                })
                res.status(200).json({accessToken,mainPage:'go',folderId:folderId.parentFolderId})

}

async function LoginIn(password,email,res){
        const User=await modelUserData.findOne({email})
        if(User){
         const isEqual=await bcrypt.compare(password,User?.password)
        
         if(isEqual){
            let accessToken=generateAccessToken(User._id)
            let refreshToken=generateRefreshToken(User._id)
            await redisClient.set(refreshToken,'refreshToken')
            res.cookie('refreshToken',refreshToken,{
                maxAge:1000*60*60*24*7,
                httpOnly: true,
                secure: true,
                sameSite: 'strict'
            })
            
           return res.status(200).json({accessToken,mainPage:'go',folderId:User.parentFolderId})
         }
         else{
           return res.status(401).json({toastMessage:'invalid credentials'})
         }
        }
        else{
          return  res.status(401).json({toastMessage:'invalid credentials'})
        }
        }

export const login = async (req,res) =>{
    let refreshToken=req.cookies?.refreshToken;
    let {email,password,accessToken}=req.body
     if(refreshToken || accessToken){
        if(refreshToken){
           const redisRefreshTokenIsExisting = await redisClient.get(refreshToken)
     if(redisRefreshTokenIsExisting){
        if(accessToken){
           const isValidAccessToken = verifyToken(accessToken);
           if(isValidAccessToken){
            res.status(200).json({mainPage:'go'})
           }
           else{
               return await newTokenAssigning(redisRefreshTokenIsExisting,refreshToken,redisClient,res)
           }
        }
        else{
                return await newTokenAssigning(redisRefreshTokenIsExisting,refreshToken,redisClient,res)
        }
     }
     else{
     await LoginIn(password,email,res)
     }
        }
        else{
            const isValidAccessToken = verifyToken(accessToken);
           if(isValidAccessToken){
            res.status(200).json({mainPage:'go'})
           }
           else{
           await LoginIn(password,email,res)
           }
        }
     
    }
    else{
     await LoginIn(password,email,res)
    }
}
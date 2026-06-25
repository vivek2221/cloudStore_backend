import { readFileSync } from 'fs'
import jwt from 'jsonwebtoken'

const privateKey=readFileSync('./private.pem','utf8')
const publicKey=readFileSync('./public.pem','utf8')
export const generateAccessToken=(user)=>{
    return jwt.sign({userId:user},privateKey,{algorithm:'RS256',expiresIn:'15m'})
}
export const generateRefreshToken=(user)=>{
    return jwt.sign({userId:user},privateKey,{algorithm:'RS256',expiresIn:'7d'})
}
export const verifyToken= (token)=>{
    try{
        return jwt.verify(token,publicKey,{algorithms:['RS256']})
    }catch(error){
         return null
    }
}
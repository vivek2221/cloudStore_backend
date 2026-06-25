import mongoose from 'mongoose'

async function connect(){
   try{
       await mongoose.connect("mongodb://localhost:27017/cloudAppStorage?replicaset=replica")
   }catch(err){
       console.log('this error had occured',err.message)
       process.exit(1);
   }
}
connect()
    // models schemas from here
    const userSchema=new mongoose.Schema({
       name : String,
       email : String,
       password: String,
       parentFolderId:mongoose.Types.ObjectId
    });
    const folders=new mongoose.Schema({
        folderName:{
            type:String,
            default:'New Folder'
        },
        parentFolderId:{
            type:mongoose.Types.ObjectId,
            default:null
        },
        userName:String,
        userId:mongoose.Types.ObjectId,
        typeOfFolder:{
            type:String,
            default:'regular'
        },
        subFiles:[],
        subFolders:[],
        capacity:Number,
        deleted:{
            type:Boolean,
            default:false,
        }
        ,
        count:{
            type:Number,
            default:0
        },
        modifiedDate:Date
    })
  
    const files=new mongoose.Schema(
        {
            fileName:String,
            fileSize:String,
            fileSizeBytes:Number,
            parentFolderId:mongoose.Types.ObjectId,
            userId:mongoose.Types.ObjectId,
            deleted:{
                type:Boolean,
                default:false
            },
            modifiedDate:Date,
            diskPath:String,
            mimeType:String
        }
    )
    const modelUserData=mongoose.model('userSchema',userSchema);
    const modelFoldersData=mongoose.model('folders',folders);
    const modelFilesData=mongoose.model('files',files);
    process.on('SIGINT',async ()=>{
    await mongoose.disconnect()
    process.exit(0);
    })
    
export {
     modelUserData,
     modelFilesData,
     modelFoldersData,
    }
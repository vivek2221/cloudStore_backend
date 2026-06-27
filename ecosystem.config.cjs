module.exports={
    apps: [
        {
          name:"serverMain",
          script:"index.js",
          cwd:"/home/ubuntu/cloudStore_backend",
          instances:"max",
          exec_mode:"cluster",
          wait_ready:true,
          listen_timeout:3000,
          env:{
            NODE_ENV:"production",
          }
        }
    ]
}
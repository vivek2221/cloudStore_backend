export default {
    apps: [
        {
          name:"serverMain",
          script:"index.js",
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
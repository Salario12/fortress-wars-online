import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PORT=process.env.PORT||3000;
const rooms=new Map();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
const broadcast=(room,data,except=null)=>room.players.forEach(p=>{if(p.ws!==except)send(p.ws,data)});
const code=()=>{let c;do{c="FW-"+Math.floor(1000+Math.random()*9000)}while(rooms.has(c));return c};

const server=http.createServer((req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify({ok:true,rooms:rooms.size}));}
  if(req.url==="/" || req.url==="/index.html"){
    const file=path.join(__dirname,"index.html");
    fs.readFile(file,(err,data)=>{
      if(err){res.writeHead(500,{"content-type":"text/plain; charset=utf-8"});return res.end("No se pudo cargar Fortress Wars");}
      res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-cache"});
      res.end(data);
    });
    return;
  }
  res.writeHead(404,{"content-type":"application/json"});res.end(JSON.stringify({error:"not_found"}));
});
const wss=new WebSocketServer({server});
wss.on("connection",ws=>{
  const player={id:crypto.randomUUID(),ws,room:null,name:"Jugador",state:{}};
  send(ws,{type:"connected",playerId:player.id});
  ws.on("message",raw=>{
    let m;try{m=JSON.parse(raw)}catch{return send(ws,{type:"error",message:"Mensaje invalido"})}
    if(m.type==="create_room"){
      if(player.room)leave(player);
      const id=code(); const room={id,players:[player],created:Date.now()};
      rooms.set(id,room);player.room=id;player.name=String(m.name||"Jugador 1").slice(0,24);
      return send(ws,{type:"room_created",room:id,playerId:player.id});
    }
    if(m.type==="join_room"){
      const id=String(m.room||"").toUpperCase();const room=rooms.get(id);
      if(!room)return send(ws,{type:"error",message:"Sala no encontrada"});
      if(room.players.length>=2)return send(ws,{type:"error",message:"Sala llena"});
      if(player.room)leave(player);
      player.room=id;player.name=String(m.name||"Jugador 2").slice(0,24);room.players.push(player);
      broadcast(room,{type:"room_ready",room:id,players:room.players.map(p=>({id:p.id,name:p.name}))});
      return;
    }
    const room=player.room&&rooms.get(player.room); if(!room)return;
    if(m.type==="state"){player.state=m.state||{};return broadcast(room,{type:"state",playerId:player.id,state:player.state},ws);}
    if(["shoot","ability","hit","ready","restart"].includes(m.type)) broadcast(room,{...m,playerId:player.id},ws);
  });
  ws.on("close",()=>leave(player));
});
function leave(player){
  if(!player.room)return;const room=rooms.get(player.room);player.room=null;if(!room)return;
  room.players=room.players.filter(p=>p!==player);
  if(!room.players.length)rooms.delete(room.id);else broadcast(room,{type:"player_left",playerId:player.id});
}
server.listen(PORT,"0.0.0.0",()=>console.log("Fortress Wars server on",PORT));
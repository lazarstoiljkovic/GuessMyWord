const express= require('express');
const app=express(); 
const http = require('http');
const server = http.createServer(app);
const redis = require('redis');
const bodyParser= require('body-parser');
const io = require('socket.io').listen(server);
var idRoom=1;
var idUser=1;
var brojacPogodjenihReci=0;

app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());

server.listen(3000,function(){
    console.log("Listening on port 3000");
});
console.log("server running....");

var sub = redis.createClient("redis://127.0.0.1:6379"); //za subscribe
var pub = redis.createClient("redis://127.0.0.1:6379"); //za publish 
var client = redis.createClient("redis://127.0.0.1:6379");  //za kesiranje

client.on('error',function(err){
	console.log("Error: "+err);

});

client.flushall(function (err,successed){
    console.log(successed);
})

//pokretanjem klijenta server vraća fajl login.html
app.get('/',function(req,res){

	res.sendFile(__dirname+'/login.html');
});

//post zahtev - korisniku se dodeljuje idUser i idRoom i vrši se keširanje
//takođe korisnike se prijavljuje (subscribe) na odgovarajući kanal
//server korisniku vraća fajl pocetna.html
app.post('/login',function(req,res){
    const user=req.body;
    console.log(user);
    user["points"]=0;
    console.log(user);

    //io.sockets.emit('idRoom',idRoom);
    //io.sockets.emit('idUser',idUser);

    client.set(idUser,JSON.stringify(user));
    if(idUser % 5 === 0)
    {
        idRoom=idRoom+1;
    }
    sub.subscribe("channel"+idRoom);
    idUser=idUser+1;
    res.sendFile(__dirname+"/pocetna.html");

});

//sekcija u okviru koje se obradjuju asinhroni zahtevi od strane klijenta korišćenjem iosocket biblioteke
io.on('connect',function(socket){
    socket.emit('dobrodoslica','Dobrodosli-prijavili ste ma server');
    socket.on('ready',function(msg){
        console.log(msg);
        socket.emit('idRoom',idRoom);
        socket.emit('idUser',idUser-1);
        client.get(idUser-1,function(err,result){
            if(result)
            {
                console.log(JSON.parse(result));
                console.log(JSON.parse(result)["username"]);
                socket.emit('username',JSON.parse(result)["username"]);
                socket.emit('points',JSON.parse(result)["points"]);
            }
        })
        if(idUser % 5 === 0)
        {
            pub.publish("channel"+idRoom,"mozete poceti igru");
        }
        else
        {
            
            socket.emit('cekanje','sacekajte protivnike');
        }
        
    });

    socket.on('word',function(msg){
        console.log(msg);
        console.log(msg["id"]);
        client.get(msg["id"],function(err,result){
            if(result)
            {
                const user=JSON.parse(result);
                user["word"]=msg["word"];
                console.log(user);
                client.set(msg["id"],JSON.stringify(user));
            }
            else
            {
                console.log("Greska ne postoji objekat sa trazenim kljucem");
            }
        })


    });

    socket.on('playGame',function(msg){
        console.log(msg);
        msg["flag"]=1;
        pub.publish("channel"+msg["idRoom"],JSON.stringify(msg));
    })

    socket.on('asocijacija',function(msg){
        console.log(msg);
        msg["flag"]=2;
        pub.publish("channel"+msg["idRoom"],JSON.stringify(msg));
    })

    socket.on('predaja',function(msg){
        console.log(msg);
        brojacPogodjenihReci=brojacPogodjenihReci+1;
        if(brojacPogodjenihReci % 12 === 0)  //svi igraci su pogodili sve reci
        {
            socket.emit('kraj',"Kraj igre svi su pogodili sve reci ili su se predali");

        }
    })

    socket.on('prosleditiRezultat',function(msg){
        console.log(msg); 
        client.get(msg["idUser"],function(err,result){
            if(result)
            {
                var jsonRes=JSON.parse(result);
                jsonRes["flag"]=3;
                pub.publish("channel"+msg["idRoom"],JSON.stringify(jsonRes));
            }
        })
    })

    socket.on('otkljucajDugmice',function(msg){
        console.log(msg);
        pub.publish("channel"+msg["idRoom"],msg["message"]);
    })

    socket.on('pogadjamRec',function(msg){
        console.log(msg);
        client.get(msg["opponentId"],function(err,result){
            if(result)
            {
                var user=JSON.parse(result);
                console.log(user);
                console.log(user["word"]);
                console.log(msg["guessedWord"]);
                if(user["word"] === msg["guessedWord"])
                {
                    
                    client.get(msg["myId"],function(err,result){

                        if(result)
                        {
                            const me=JSON.parse(result);
                            me["points"]=me["points"]+100;  //treba neka logika za dobijanje poena
                            client.set(msg["myId"],JSON.stringify(me));
                        }

                    });

                    socket.emit('callbackPogadjamRec',"pogodili ste rec - bravo!");
                    brojacPogodjenihReci=brojacPogodjenihReci+1;

                    if(brojacPogodjenihReci % 12 === 0)  //svi igraci su pogodili sve reci
                    {
                        socket.emit('kraj',"Kraj igre svi su pogodili sve reci ili su se predali");

                    }
                }
                else
                {
                    socket.emit('callbackPogadjamRec',"nije ta rec");
                }
            }
            else
            {
                console.log("doslo je do greske");
            }
        })
    })


});



sub.on("subscribe", function(channel, count) {
	console.log("Subscribed to " + channel + ". Now subscribed to " + count + " channel(s).");
});

sub.on("message", function(channel, message) {
    console.log("Message from channel " + channel + ": " + message);
    io.sockets.emit(channel,message);
    
	

});
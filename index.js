const express = require("express");
const http = require("http");
const config = require("./config/defaults");
const cors = require("cors");
const { corsConfig } = require("./corsConfig");

const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);

app.use(cors());

const io = new Server(server, {
	cors: {
		origin: process.env.CLIENT,
		methods: ["GET", "POST"],
		credentials: true,
	},
});
const redisClient = require("./redis");
const { authUser } = require("./controllers/socket/authUser");
const { initialiseBus } = require("./controllers/socket/initialiseBus");
const { disconnectBus } = require("./controllers/socket/disconnectBus");

app.get("/", (req, res) => {
	res.sendFile(__dirname + "/index.html");
});
app.get("/status", (req, res) => {
	res.send(redisClient.status);
});

app.get("/flush", async (req, res) => {
	await redisClient.flushall();
	res.send("ok");
});

io.use(authUser);

io.on("connect", (socket) => {
	// console.log("connected", socket.user);
	if (socket.user) {
		// if current user is logged in as bus account
		initialiseBus(socket);
	}

	socket.on("join", async (busId, errorCallback) => {
		// check if bus is online if not dont let user join
		const busData = await redisClient.hgetall(`busId:${busId}`);
		if (!busData || !(busData.connected === "true")) {
			if (errorCallback) errorCallback();
			return;
		}
		console.log("Client Joined", busId);
		socket.join(busId);
	});

	socket.on("location", (location, busId, errorCallback) => {
		// only allow bus account to post location
		if (!socket.user) {
			if (errorCallback) errorCallback();
			return;
		}
		io.to(socket.user.id).emit("receive_location", location);
	});

	socket.on("disconnect", () => {
		// disconnect bus
		if (socket.user) {
			disconnectBus(socket);
			io.to(socket.user.id).emit("receive_disconnect", "disconnected");
		}
		console.log("Disconnected");
	});
});

server.listen(config.PORT, (req, res) => {
	console.log("Listening on port", config.PORT);
});

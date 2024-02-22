const userService = require('../services/userService');
const callService = require('../services/callService');
const loggingService = require('../services/loggingService');
const schedulingService = require('../services/schedulingService');

module.exports = function(io) {
    schedulingService.checkTimeslotsObservable().subscribe(async (timeslot) => {
        const allCalls = await callService.getCalls();
        const users = await userService.getUsers();

        if (timeslot.timeslot > 1) {
            const prevTimeslot = timeslot.timeslot - 1;
            const prevCalls = allCalls[prevTimeslot.toString()];

            if (prevCalls && prevCalls.length > 0) {
                prevCalls.forEach(async (call) => {
                    const callerSocketId = users.find(user => user.emoji === call.callerEmoji).socketId;
                    io.to(callerSocketId).emit('hangup');
                });
            }
        }
        
        const currentCalls = allCalls[timeslot.timeslot.toString()];
        console.log('Current calls:', currentCalls);

        // get the socketId of the callerEmoji and send it the peerId of the calleeEmoji
        if (currentCalls && currentCalls.length > 0) {
            currentCalls.forEach(async (call) => {
                const callerSocketId = users.find(user => user.emoji === call.callerEmoji).socketId;
                const calleePeerId = users.find(user => user.emoji === call.calleeEmoji).peerId;

                // emit only to the caller
                io.to(callerSocketId).emit('callPeer', { peerId: calleePeerId });
            });
        }

    });

    io.on('connection', async (socket) => {
        console.log('User connected with socket id: ' + socket.id);
        const users = await userService.getUsers();
        const currentCalls = await callService.getCalls();
        io.emit('users', { users: users, calls: currentCalls });
        io.emit('newCall', currentCalls);

        socket.on('registerUser', async (data) => {
            const { peerId, emoji } = data;
            await userService.updatePeerId(emoji, peerId);
            await userService.updateSocketId(emoji, socket.id);
            console.log(`Registered new user: ${emoji} with peerId: ${peerId} and socketId: ${socket.id}`);
        });

        socket.on('disconnect', async () => {
            const users = await userService.getUsers();
            const userIndex = users.findIndex(user => user.socketId === socket.id);
            if (userIndex !== -1) {
                await userService.updateSocketId(users[userIndex].emoji, null);
                console.log(`User ${users[userIndex].emoji} has disconnected`);
            }
        });

        socket.on('toggleFan', async () => {
            await userService.toggleUserAvailability(socket.id);
            const users = await userService.getUsers();
            const calls = await callService.getCalls();
            io.emit('users', { users: users, calls: calls });
        });

        socket.on('callUser', async (data) => {
            await callService.addCall(data.callerEmoji, data.calleeEmoji, data.timeslot);
            const currentCalls = await callService.getCalls();
            io.emit('newCall', currentCalls);
            await loggingService.insertRow([new Date().toISOString(), data.callerEmoji, data.calleeEmoji, data.timeslot]);
        });
    });
};

import express, { json, text } from 'express';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import joi from 'joi';
import dayjs from 'dayjs';
import cors from 'cors';

const server = express();
server.use(express.json());
server.use(cors());
dotenv.config();
const formattedTime = dayjs().format("HH:mm:ss");
//dayjs.extend(utc);
//dayjs.extend(timzone);




const mongoClient = new MongoClient(process.env.DATABASE_URL);
try {
    await mongoClient.connect();
    console.log("Conexão realizada com sucesso!");
} catch (err) {
    console.log(err.message)
}
const db = mongoClient.db();

server.post('/participants', async (req, res) => {
    const { name } = req.body;

    const participantSchema = joi.object({ name: joi.string().trim().required() });
    const validation = participantSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const participant = { name, lastStatus: Date.now() };
        const participantExist = await db.collection('participants').findOne({ name });
        if (participantExist) return res.status(409).send("Usuário já está em uso");
        await db.collection('participants').insertOne(participant);

        const message = {
            from: participant.name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: formattedTime
        };
        await db.collection('messages').insertOne(message);
        res.sendStatus(201);
    } catch (err) {
        res.status(500).send(err.message);
    }
})

server.get('/participants', async (req, res) => {
    try {
        const participants = await db.collection('participants').find().toArray();
        res.send(participants)
    } catch (err) {
        res.status(500).send(err.message);
    }
});

server.post('/messages', async (req, res) => {
    const from = req.header("User");
    if (!from) return res.status(422).send("Acesso negado");

    const messageSchema = joi.object({
        to: joi.string().trim().required(),
        text: joi.string().trim().required(),
        type: joi.string().valid("message", "private_message").required(),
    })

    const validation = messageSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        return res.status(422).send(errors);
    }
    try {
        const message = {
            from,
            to: req.body.to,
            text: req.body.text,
            type: req.body.type,
            time: formattedTime
        };
        await db.collection('messages').insertOne(message)
        res.sendStatus(201);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

server.get('/messages', async (req, res) => {
    const user = req.header("User");
    if (!user) return res.status(422).send("Acesso negado");

    const { limit } = req.query;
    if (limit && (isNaN(limit) || parseInt(limit) <= 0)) return res.status(422).send("Valor limite inválido");

    try {
        if (limit) {
            const limitedMessages = await db.collection('messages')
                .find({
                    $or: [
                        { to: "Todos" },
                        { to: user },
                        { from: user },
                    ]
                })
                .sort({ $natural: -1 })
                .limit(parseInt(limit))
                .toArray();
            return res.send(limitedMessages);
        }
        const messages = await db.collection('messages')
            .find({
                $or: [
                    { to: "Todos" },
                    { to: user },
                    { from: user },
                ]
            })
            .sort({ $natural: -1 })
            .toArray();
        return res.send(messages);
    } catch (err) {
        res.status(500).send(err.message);
    }
});


//{from: 'João', to: 'Todos', text: 'oi galera', type: 'message', time: '20:04:37'}

const PORT = 5000;
server.listen(PORT, () => console.log(`Host is running at port ${PORT}`));
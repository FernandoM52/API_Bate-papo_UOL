import express, { json } from 'express';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import Joi from 'joi';
import dayjs from 'dayjs';
import cors from 'cors';

const server = express();
server.use(express.json());
server.use(cors());
dotenv.config();
//dayjs.extend(utc);
//dayjs.extend(timzone);




const mongoClient = new MongoClient(process.env.DATABASE_URL);
try {
    await mongoClient.connect();
    console.log("Conexão realizada com sucesso!");
} catch (err) {
    console.log(err.message)
}
const db = mongoClient.db("BatePapoUolAPI");

server.post('/participants', async (req, res) => {
    const participantSchema = Joi.object({ name: Joi.string().required() });
    const validation = participantSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const participant = { name: req.body.name, lastStatus: Date.now() }
        const participantExist = await db.collection('participants').findOne({ name: participant.name });
        if (participantExist) return res.status(409).send("Usuário já está em uso");

        await db.collection('participants').insertOne({ participant });

        const message = {
            from: participant.name,
            to: "Todos",
            text: "entra na sala...",
            type: participant.lastStatus,
            time: dayjs().format("HH:mm:ss")
        };
        await db.collection('messages').insertOne({ message });
        res.sendStatus(201);
    } catch (err) {
        res.status(500).send(err.message);
    }
})

const PORT = 5000;
server.listen(PORT, () => console.log(`Host is running at port ${PORT}`));
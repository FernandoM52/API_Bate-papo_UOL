import express, { json, text } from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import joi from 'joi';
import dayjs from 'dayjs';
import cors from 'cors';

const server = express();
server.use(express.json());
server.use(cors());
dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
try {
    await mongoClient.connect();
    console.log("Conectado ao banco com sucesso!");
} catch (err) {
    console.log(err.message)
}
const db = mongoClient.db();
const formattedTime = dayjs().format("HH:mm:ss");

setInterval(async () => {
    const cutTime = Date.now() - 10000;

    try {
        const participants = await db.collection("participants").findOneAndDelete({ lastStatus: { $lte: cutTime } });
        if (participants.value) {
            const { name } = participants.value;

            const message = {
                from: name,
                to: "Todos",
                text: "sai da sala...",
                type: "status",
                time: formattedTime
            };
            await db.collection("messages").insertOne(message);
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
}, 15000);

server.post("/participants", async (req, res) => {
    const { name } = req.body;

    const participantSchema = joi.object({ name: joi.string().trim().required() });
    const validation = participantSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const participant = { name, lastStatus: Date.now() };
        const participantExist = await db.collection("participants").findOne({ name });
        if (participantExist) return res.status(409).send("Usuário já está em uso");
        await db.collection("participants").insertOne(participant);

        const message = {
            from: participant.name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: formattedTime
        };
        await db.collection("messages").insertOne(message);
        res.sendStatus(201);
    } catch (err) {
        res.status(500).send(err.message);
    }
})

server.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find().toArray();
        res.send(participants)
    } catch (err) {
        res.status(500).send(err.message);
    }
});

server.post("/messages", async (req, res) => {
    const from = req.header("User");
    if (!from) return res.status(422).send("Acesso negado");

    const isParticipant = await db.collection("participants").findOne({ name: from });
    if (!isParticipant) return res.status(422).send("Usuário não foi encontrado na lista de participantes cadastrados");

    const messageSchema = joi.object({
        to: joi.string().trim().required(),
        text: joi.string().trim().required(),
        type: joi.string().valid("message", "private_message").required(),
    });

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
        await db.collection("messages").insertOne(message)
        res.sendStatus(201);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

server.get("/messages", async (req, res) => {
    const user = req.header("User");
    if (!user) return res.status(422).send("Acesso negado");

    const { limit } = req.query;
    if (limit && (isNaN(limit) || parseInt(limit) <= 0)) return res.status(422).send("Valor limite inválido");

    try {
        if (limit) {
            const limitedMessages = await db.collection("messages")
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
        const messages = await db.collection("messages")
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

server.post("/status", async (req, res) => {
    const user = req.header("User");
    if (!user) return res.sendStatus(404);

    try {
        const isParticipant = await db.collection("participants").findOne({ name: user });
        if (!isParticipant) return res.sendStatus(404);

        const updateStatus = { $set: { lastStatus: Date.now() } };
        const result = await db.collection("participants").updateOne({ name: user }, updateStatus);
        if (result.matchedCount === 0) return res.status(404).send("Erro ao atualizar usuário, o mesmo não foi encontradado");

        res.send("Atualizado com sucesso!");
    } catch (err) {
        res.status(500).send(err.message);
    }
});

server.delete("/messages/:id", async (req, res) => {
    const user = req.header("User");
    const { id } = req.params;

    try {
        const isParticipant = db.collection("participants").findOne({ name: user });
        if (!isParticipant) return res.sendStatus(401);

        const result = await db.collection("messages").findOneAndDelete({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).send("Menssagem não encontrada");

        return res.status(200).send({ message: "Documentos apagados com sucesso!" })
    } catch (err) {
        return res.status(500).send(err.message);
    }
})

server.put("/messages/:id", async (req, res) => {
    const from = req.header("User");
    const { id } = req.params;

    const isParticipant = db.collection("participants").findOne({ name: from });
    if (!isParticipant) return res.sendStatus(401);

    const editMessageSchema = joi.object({
        to: joi.string().trim().required(),
        text: joi.string().trim().required(),
        type: joi.string().valid("message", "private_message").required(),
    });

    const validation = editMessageSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const editedMessage = {
            from,
            to: req.body.to,
            text: req.body.text,
            type: req.body.type,
            time: formattedTime
        };
        const result = await db.collection("messages").findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: editedMessage }
        );
        if (result.matchedCount === 0) return res.status(404).send("Mensagem não encontrada");
        res.send("Mensage atualizada com sucesso!");
    } catch (err) {
        return res.status(500).send(err.message);
    }
});

const PORT = 5000;
server.listen(PORT, () => console.log(`Servidor está rodando na porta ${PORT}`));
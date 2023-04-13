import express, { json } from 'express';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import cors from 'cors';

const server = express();
server.use(express.json());
server.use(cors());
dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;
mongoClient.connect()
    .then(() => db = mongoClient.db("dbBatePapoUol"))
    .catch(err => console.log(err.message));

PORT = 5000;
server.listen(PORT, () => console.log(`Host is running at port ${PORT}`));
import { createMemoryStore } from "./index";
import { opStoreContract } from "./store-contract";

opStoreContract("the in-memory store", createMemoryStore);

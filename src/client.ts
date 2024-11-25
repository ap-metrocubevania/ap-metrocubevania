import {
    BouncedPacket, Client, Item, itemsHandlingFlags,
    JSONRecord, LocationInfoPacket,
    MessageNode, NetworkSlot, Player,
} from "archipelago.js";

// Create a new Archipelago client
const client: Client = new Client();
const form: Element = document.querySelector("#connection-details")

//pico-8 related declarations
// @ts-ignore
const gpio = getP8Gpio();
const loc_flags: Record<string, number[]> = {
    "Springboards": [0, 1],
    "Double Jump": [1, 4],
    "Dive": [2, 7],
    "Key": [3, 10],
    "Starting Medal": [4, 0],
    "Springboards Medal": [5, 2],
    "Lava Medal": [6, 9],
    "Cage Medal": [7, 5],
    "Ice Medal": [8, 12],
    "victory": [9, 13],
    "Enter Crossprings": [10, 3],
    "Enter Upper Ice": [11, 6],
    "Enter Lava": [12, 8],
    "Enter Lower Ice": [13, 11],
};

const item_flags: Record<string, number[]> = {
    "springboards": [0, 3],
    "double jump": [1, 0],
    "dive": [2, 1],
    "key": [3, 2],
    "starting medal": [4, 4],
    "springboards medal": [5, 5],
    "lava medal": [6, 6],
    "cage medal": [7, 7],
    "ice medal": [8, 8],
};
const base_id: number = 19828412012;

let checked_locations: number[] = [];

type GameOptions = {
    DeathLink?: number,
    DeathLink_Amnesty?: number,
    MedalHunt?: number,
    ExtraCheckpoint?: number,
    ExtraChecks?: number
};
let options: GameOptions = {}

let thisPlayer: number = 0;
type Players = Record<number, {
    slot: number,
    name: string,
    game: string,
    alias: string
}>;
let players: Players = {};

let DeathLink_Amnesty: number = 0;

function message_pico8(message: string) {
    let index: number = 37;
    //let log = "";
    for (let i = 0; i < message.length; i++) {
        gpio[index] = message[i].charCodeAt(0);
        index++;
    }
}

// Set up event listeners
client.messages.on("connected", async (text: string, player: Player, tags: string[], nodes: MessageNode[]) => {
    console.log("Connected to server: ", player);
    thisPlayer = player.slot;
    const slots: Record<number, NetworkSlot> = client.players.slots;
    Object.entries(slots).forEach(([key, slot]: [string, NetworkSlot]) => {
        const slotNumber: number = parseInt(key)
        const slotPlayer: Player = client.players.findPlayer(slotNumber);
        players[slotNumber] = {
            slot: slotNumber,
            name: slot.name,
            game: slot.game,
            alias: slotPlayer.alias,
        }
    })

    // set up gpio options
    options = await player.fetchSlotData().then(res => res as GameOptions);

    let optionsByte: number = 1;
    if (options.DeathLink !== 0) {
        optionsByte += 2;
        client.socket.send({
            cmd: "ConnectUpdate",
            items_handling: itemsHandlingFlags.all,
            tags: ["DeathLink"]
        });
        // client.deathLink.enableDeathLink();
        DeathLink_Amnesty = options.DeathLink_Amnesty;
    }
    if (options.MedalHunt) {
        optionsByte += 4;
    }
    if (options.ExtraCheckpoint) {
        optionsByte += 8;
    }
    if (options.ExtraChecks) {
        optionsByte += 16;
    }
    gpio[20] = optionsByte;

    client.socket.send({ cmd: "Sync" });
});

// add item handler for gpio layer
client.items.on("itemsReceived", async(items: Item[], startingIndex: number) => {
    console.log("Received items: ", items);
    // if this is a sync packet reset all our item addresses without changing anything else
    if (startingIndex === 0) {
        for (let i: number = 10; i < 20; i++) {
            gpio[i] = 0;
        }
    }

    // go through all our item addresses and if they are not set, check the received items for their ap id,
    // and set the gpio flag if we received it
    // on the scale I expect pico-8 games to be, this will be good enough
    // console.log(`gpio: ${gpio}`)
    for (let i: number = 0; i < items.length; i++) {
        let item: Item = items[i];
        if (item.id == base_id + 9) {
            if (item.sender.slot == thisPlayer) {
                message_pico8("found counterfeit medal :(");
            } else {
                if (item.sender.alias === ""){
                    message_pico8(`got counterfeit medal from ${item.sender.name} :(`.toLowerCase())
                } else {
                    message_pico8(`got counterfeit medal from ${item.sender.alias} :(`.toLowerCase())
                }
            }
        }

        for (const flag in item_flags) {
            if (base_id + item_flags[flag][1] === item.id) {
                const byte = Math.floor(item_flags[flag][0] / 8) + 10;
                const item_bit = 2 ** (item_flags[flag][0] % 8);
                if (gpio[byte] & item_bit) {  // yes this is supposed to be bitwise and
                    console.log(`${flag} has already been received`);
                } else {
                    gpio[byte] |= item_bit;
                    if (item.sender.slot === thisPlayer) {
                        message_pico8(`found ${flag}`.toLowerCase())
                    } else {
                        if (item.sender.alias === ""){
                            message_pico8(`got ${flag} from ${item.sender.name}`.toLowerCase())
                        } else {
                            message_pico8(`got ${flag} from ${item.sender.alias}`.toLowerCase())
                        }
                    }
                }
            }
        }
    }
});

client.socket.on("bounced", (packet: BouncedPacket, data: JSONRecord) => {
    console.log("Bounced ", packet);
    if (packet.tags.includes('DeathLink') && options.DeathLink !== 0 && !packet.slots.includes(thisPlayer)) {
        gpio[25] = gpio[25] | 1;
        DeathLink_Amnesty += 1;
        // TODO: fix deathlink source message
        if (packet.data.source) {
            const source = packet.data.source as string;
            const player = Object.values(players)
                .filter(k => k.name == source)[0];
            if (player.alias === ""){
                message_pico8(`deathlinked by ${player.name}`.toLowerCase());
            } else {
                message_pico8(`deathlinked by ${player.alias}`.toLowerCase());
            }
        } else {
            message_pico8("deathlinked");
        }
    }
});

//add location info listener to give game sent item text
client.socket.on("locationInfo", (packet: LocationInfoPacket) => {
    console.log("Location Info: ", packet);
    packet.locations.forEach(location => {
        if (location.player !== thisPlayer) {
            const itemName = new Item(
                client, location, client.players.self, client.players.findPlayer(location.player)
            ).name;
            if (players[location.player].alias === "") {
                message_pico8(`sent ${itemName} to ${players[location.player].name}`.toLowerCase());
            } else {
                message_pico8(`sent ${itemName} to ${players[location.player].alias}`.toLowerCase());
            }
        }
    });
});

// Connect to the Archipelago server
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const hostname = document.querySelector<HTMLInputElement>("#hostname").value;
    const port = document.querySelector<HTMLInputElement>("#port").value;
    const password = document.querySelector<HTMLInputElement>("#password").value;
    const name = document.querySelector<HTMLInputElement>("#slot-name").value;

    console.log(hostname);
    console.log(port);
    console.log(name);

    const statusWrapper = document.querySelector(".status-wrapper");
    const connected = document.querySelector(".status-connected");
    const failed = document.querySelector(".status-failed");
    const connecting = document.querySelector(".status-connecting");

    statusWrapper.classList.remove("d-none");
    connected.classList.add("d-none");
    failed.classList.add("d-none");
    connecting.classList.remove("d-none");

    await client.login(
        hostname.startsWith("ws") ?
            `${hostname}:${port}` :
            `wss://${hostname}:${port}`,
        name, "MetroCUBEvania", {
            password,
            items: itemsHandlingFlags.all,
            version: {
                build: 0,
                major: 5,
                minor: 0,
            },
        }
    ).then(() => {
        console.log("Connected to the server");
        connecting.classList.add("d-none");
        connected.classList.remove("d-none");
        // You are now connected and authenticated to the server. You can add more code here if need be.
        const toggle = document.querySelector('.toggle-login-form');
        const loginForm = document.querySelector('.login-form');
        toggle.addEventListener('click', () => {
            loginForm.classList.toggle('d-none', !loginForm.classList.contains('d-none'));
        });
        loginForm.classList.add('d-none');
        toggle.classList.remove('d-none');
    }).catch(error => {
        console.error("Failed to connect:", error);
        connecting.classList.add("d-none");
        failed.classList.remove("d-none");
    });
});

// add location handler for gpio layer
// sending information to the pico8 will trigger this function sending all checks to ap again
// if you always send information to the pico8 when the gpio updates, that can cause an infinite loop
gpio.subscribe(async function (newIndices) {
    if (options.DeathLink !== 0 && (gpio[25] & 2) !== 0) {
        console.log("Death");
        gpio[25] = gpio[25] - 2;
        DeathLink_Amnesty -= 1;
        if (DeathLink_Amnesty === 0) {
            DeathLink_Amnesty = options.DeathLink_Amnesty;
            client.socket.send({ cmd: "Bounce", tags: ['DeathLink'], data: {"source": thisPlayer}});
            if (options.DeathLink_Amnesty > 1) {
                message_pico8("sent deathlink")
            }
        }
    }
    for (let loc in loc_flags) {
        if ((gpio[Math.floor(loc_flags[loc][0] / 8)] & 2 ** (loc_flags[loc][0] % 8)) !== 0) {
            if (loc === "victory") {
                client.goal();
            } else {
                console.log(`Checking location id: ${base_id + loc_flags[loc][1]}`)
                client.check(base_id + loc_flags[loc][1]);
                if (!checked_locations.includes(base_id + loc_flags[loc][1])){
                    await client.scout([base_id + loc_flags[loc][1]], 0);
                }
                checked_locations.push(base_id + loc_flags[loc][1]);
            }
        }
    }
});
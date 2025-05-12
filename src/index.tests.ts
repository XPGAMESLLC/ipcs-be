// Strona światełek

import { on, send } from ".";

on("xp_dl:register.light", (payload, respond) => {
    const { location, intensity } = payload;
    if (location.x === 0 && location.y === 0 && location.z === 0) {
        respond!({
            ok: false,
            error: "Light source must be placed in the world",
        });
    }
    // do stuff
    respond!({ ok: true });
}); 



// Hostile Mobs

send("xp_dl:register.light", {
    location: { x: 0, y: 0, z: 0 },
    intensity: 10,
}, undefined, (response) => {
    if (!response || !response.ok) {
        console.error("Failed to register light source:", response?.error);
    }
});
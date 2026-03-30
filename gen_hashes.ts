import bcrypt from 'bcryptjs';

async function main() {
    const sharonHash = await bcrypt.hash('K9#fP2!vLq7*Zt$5nB@x8W&m', 12);
    const victorHash = await bcrypt.hash('Gb#8v!mZ2*5rX$q9Lp@7W&k4', 12);

    console.log('Sharon hash:', sharonHash);
    console.log('Victor hash:', victorHash);
}

main();

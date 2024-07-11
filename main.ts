let digits = [
    0xC0, // 0
    0xF9, // 1
    0xA4, // 2
    0xB0, // 3
    0x99, // 4
    0x92, // 5
    0x82, // 6
    0xF8, // 7
    0x80, // 8
    0x90  // 9
];

function sendByte(byte: number) {
    for (let i = 0; i < 8; i++) {
        let bit = (byte & (1 << (7 - i))) ? 1 : 0;
        pins.digitalWritePin(DigitalPin.P0, bit);
        control.waitMicros(1);
        pins.digitalWritePin(DigitalPin.P2, 1);  // シフトクロックをHIGHに
        control.waitMicros(1);
        pins.digitalWritePin(DigitalPin.P2, 0);  // シフトクロックをLOWに
    }
}

function latch() {
    pins.digitalWritePin(DigitalPin.P1, 1);  // ラッチクロックをHIGHに
    control.waitMicros(1);
    pins.digitalWritePin(DigitalPin.P1, 0);  // ラッチクロックをLOWに
}

function decToBcd(val: number): number {
    return ((val / 10) << 4) + (val % 10);
}

function bcdToDec(val: number): number {
    return ((val >> 4) * 10) + (val & 0x0F);
}

function readRTC(): { hours: number, minutes: number, seconds: number } {
    pins.i2cWriteNumber(0x68, 0x00, NumberFormat.UInt8BE);
    let buf = pins.i2cReadBuffer(0x68, 3);

    let seconds = bcdToDec(buf[0] & 0x7F); // マスクを適用して上位ビットを無視
    let minutes = bcdToDec(buf[1] & 0x7F); // マスクを適用して上位ビットを無視
    let hours = bcdToDec(buf[2] & 0x3F);   // マスクを適用して上位ビットを無視

    return { hours, minutes, seconds };
}

function writeRTC(hours: number, minutes: number, seconds: number) {
    let buf = pins.createBuffer(4);
    buf[0] = 0x00;
    buf[1] = decToBcd(seconds);
    buf[2] = decToBcd(minutes);
    buf[3] = decToBcd(hours);
    pins.i2cWriteBuffer(0x68, buf);
}

function displayTime(hours: number, minutes: number, seconds: number) {
    let hourTens = Math.floor(hours / 10);
    let hourOnes = hours % 10;
    let minuteTens = Math.floor(minutes / 10);
    let minuteOnes = minutes % 10;
    let secondTens = Math.floor(seconds / 10);
    let secondOnes = seconds % 10;

    sendByte(digits[hourTens]);
    sendByte(digits[hourOnes]);
    sendByte(digits[minuteTens]);
    sendByte(digits[minuteOnes]);
    sendByte(digits[secondTens]);
    sendByte(digits[secondOnes]);

    latch(); // 全桁を一度に表示
}

// シリアル通信の初期化
serial.redirect(SerialPin.P8, SerialPin.P12, BaudRate.BaudRate9600)

// フォルダ1のトラック1を再生するコマンド
// 次の曲 
// let playFolderTrackCommand = [0x7E, 0xFF, 0x06, 0x01, 0x00, 0x00, 0x00, 0xFE, 0xFA, 0xEF];
// 前の曲
// let playFolderTrackCommand = [0x7E, 0xFF, 0x06, 0x02, 0x00, 0x00, 0x00, 0xFE, 0xF9, 0xEF];
// 1曲目
// let playFolderTrackCommand = [0x7E, 0xFF, 0x06, 0x0F, 0x00, 0x01, 0x01, 0xFE, 0xEA, 0xEF];
// 2曲目
let playFolderTrackCommand = [0x7E, 0xFF, 0x06, 0x0F, 0x00, 0x01, 0x02, 0xFE, 0xE9, 0xEF];

// DFPlayer Mini にコマンドを送信する関数
function sendDFPlayerCommand(command: number[]) {
    let buf = pins.createBuffer(command.length);
    for (let i = 0; i < command.length; i++) {
        buf[i] = command[i];
    }
    serial.writeBuffer(buf);
}

let hours = 0;
let minutes = 0;
let seconds = 0;
let playd = 0;

// 光センサーの値を取得する関数
function getLightLevel(): number {
    return pins.analogReadPin(AnalogPin.P3); // TEMT6000をP3に接続
}

input.onButtonPressed(Button.A, function () {
    hours = (hours + 1) % 24;
    writeRTC(hours, minutes, seconds);
});

input.onButtonPressed(Button.B, function () {
    minutes = (minutes + 1) % 60;
    writeRTC(hours, minutes, seconds);
});

input.onButtonPressed(Button.AB, function () {
    seconds = 0;
    writeRTC(hours, minutes, seconds);
});

basic.forever(function () {
    let time = readRTC();
    hours = time.hours;
    minutes = time.minutes;
    seconds = time.seconds;
    displayTime(hours, minutes, seconds);

    let lightLevel = getLightLevel();

    if (seconds == 0 && minutes == 0 && lightLevel > 0) { // しきい値200を例として設定
        sendDFPlayerCommand(playFolderTrackCommand);
    }

    basic.pause(200);
});

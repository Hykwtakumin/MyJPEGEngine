//created by Takumi Hayakawa (81824869)

$(function () {

    const canvasWidth = 256;
    const canvasHeight = 256;

    let isImageReady = false;

    let quantizationTable = [
        [16, 11, 10, 16, 24, 40, 51, 61],
        [12, 12, 14, 19, 26, 58, 60, 55],
        [14, 13, 16, 24, 40, 57, 69, 56],
        [14, 17, 22, 29, 51, 87, 80, 62],
        [18, 22, 37, 56, 68, 109, 103, 77],
        [24, 35, 55, 64, 81, 104, 113, 92],
        [49, 64, 78, 87, 103, 121, 120, 101],
        [72, 92, 95, 98, 112, 100, 103, 99]
    ];

    let updatedTable;

    const elem = id => {
        return document.getElementById(id);
    };

    const clamp = value => {
        return Math.max(0, Math.min(255, Math.round(value)));
    };

    const getLuminanceFromRGB = rgb => {
        let Y = +0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
        rgb[0] = clamp(Y);
        rgb[1] = clamp(Y);
        rgb[2] = clamp(Y);
    };

    const imageForm = elem('selectImage');
    const qualitySlider = elem('quality');
    const rawCanvas = elem('rawCanvas');
    const spectrumCanvas = elem('spectrumCanvas');
    const compCanvas = elem('compCanvas');
    const diffCanvas = elem('diffCanvas');

    imageForm.addEventListener("change", event => {

        const file = event.target.files;
        const reader = new FileReader();
        reader.readAsDataURL(file[0]);
        reader.onload = () => {

            console.log("loaded");
            const image = new Image();
            image.src = reader.result;

            image.onload = () => {
                console.log("image loaded");
                updateQuality(qualitySlider.value / 100);
                isImageReady = true;

                const rawCtx = rawCanvas.getContext('2d');

                let iw = image.naturalWidth;
                let ih = image.naturalHeight;
                let scale = Math.max(canvasWidth / iw, canvasHeight / ih);
                let dw = Math.round(iw * scale);
                let dh = Math.round(ih * scale);

                if (iw === canvasWidth && ih === canvasHeight) {
                    rawCtx.drawImage(image, 0, 0, canvasWidth, canvasHeight);
                } else {
                    rawCtx.drawImage(image, 0, 0, iw, ih, (canvasWidth - dw) / 2, (canvasHeight - dh) / 2, dw, dh);
                }
                convertRGB();
            };
        };
    });

    qualitySlider.addEventListener("input", function () {
        updateQuality(qualitySlider.value / 100);
    }, false);

    qualitySlider.addEventListener("change", function () {
        updateQuality(qualitySlider.value / 100);
        if (isImageReady) {
            quantizeFrequencyDomain();
        }
    }, false);

    const updateQuality = quality => {
        updatedTable = interpolateTable(quality, quantizationTable);
    };

    const visualizeDCTData = (channelData, outCanvas) => {
        let w = channelData.width;
        let h = channelData.height;
        let data = channelData.data.slice();

        let min = Number.MAX_VALUE;
        let max = Number.MIN_VALUE;
        for (let i = 0; i < data.length; ++i) {
            let v = Math.abs(data[i]);
            min = Math.min(v, min);
            max = Math.max(v, max);
            data[i] = v;
        }
        let range = max - min;
        if (range === 0) range = 1;

        const scale = (x) => {
            x = 1 - x;
            return x * x * x;
        };

        let p = 0;
        let imageData = new ImageData(w, h);
        let pixels = imageData.data;
        for (let i = 0; i < data.length; ++i) {
            let v = scale((data[i] - min) / range) * 255;
            pixels[p++] = v;
            pixels[p++] = v;
            pixels[p++] = v;
            pixels[p++] = 255;
        }
        let outCtx = outCanvas.getContext('2d');
        outCtx.putImageData(imageData, 0, 0);
    };

    const prepareBlock = (block, channelData, x, y) => {
        let w = channelData.width;
        let data = channelData.data;
        for (let yp = 0; yp < 8; ++yp) {
            let p = (y + yp) * w + x;
            for (let xp = 0; xp < 8; ++xp) {
                block[xp][yp] = data[p++];
            }
        }
    };


    const restoreBlock = (block, channelData, x, y) => {
        let w = channelData.width;
        let data = channelData.data;
        for (let yp = 0; yp < 8; ++yp) {
            let p = (y + yp) * w + x;
            for (let xp = 0; xp < 8; ++xp) {
                data[p++] = block[xp][yp];
            }
        }
    };

    const processBlocks = (channelData, f) => {
        let w = channelData.width;
        let h = channelData.height;
        let chout = {
            width: w,
            height: h,
            data: new Array(w * h)
        };
        let block = [[], [], [], [], [], [], [], []];

        for (let y = 0; y < h; y += 8) {
            for (let x = 0; x < w; x += 8) {
                prepareBlock(block, channelData, x, y);
                f(block);
                restoreBlock(block, chout, x, y);
            }
        }

        return chout;
    };

    let work = [[], [], [], [], [], [], [], []];
    let cos = [];
    let coeff = [];
    {
        for (let x = 0; x < 8; ++x) {

            cos[x] = [];

            if (x === 0) {
                coeff[x] = Math.sqrt(2.0) / 4.0;
            } else {
                coeff[x] = 0.5;
            }

            for (let n = 0; n < 8; ++n) {
                cos[x][n] = Math.cos(Math.PI * x * (2 * n + 1) / 16.0);
            }
        }
    }

    const forwardDCT = block => {
        let i, x, n, temp;

        for (i = 0; i < 8; ++i) {
            for (x = 0; x < 8; ++x) {
                temp = 0;
                for (n = 0; n < 8; ++n) {
                    temp += block[n][i] * cos[x][n];
                }
                work[x][i] = temp * coeff[x];
            }
        }
        for (i = 0; i < 8; ++i) {
            for (x = 0; x < 8; ++x) {
                temp = 0;
                for (n = 0; n < 8; ++n) {
                    temp += work[i][n] * cos[x][n];
                }
                block[i][x] = temp * coeff[x];
            }
        }
    };

    const inverseDCT = block => {
        let i, x, n, temp;

        for (i = 0; i < 8; ++i) {
            for (x = 0; x < 8; ++x) {
                temp = 0.0;
                for (n = 0; n < 8; ++n) {
                    temp += block[n][i] * coeff[n] * cos[n][x];
                }
                work[x][i] = temp;
            }
        }

        for (i = 0; i < 8; ++i) {
            for (x = 0; x < 8; ++x) {
                temp = 0.0;
                for (n = 0; n < 8; ++n) {
                    temp += work[i][n] * coeff[n] * cos[n][x];
                }
                block[i][x] = temp;
            }
        }
    };

    const forwardDCTChannel = (channelData, visCanvas) => {

        let dct = processBlocks(channelData, forwardDCT);
        visualizeDCTData(dct, visCanvas);
        return dct;
    };

    const interpolateTable = (quality, masterTable) => {

        let table = [[], [], [], [], [], [], [], []];
        quality = 1 - quality;

        if (quality < 0.5) {
            for (let y = 0; y < 8; ++y) {
                for (let x = 0; x < 8; ++x) {
                    table[x][y] = Math.round(1 + quality * (2 * masterTable[x][y] - 1));
                }
            }
        } else {
            quality = (quality - 0.5) * 2;
            for (let y = 0; y < 8; ++y) {
                for (let x = 0; x < 8; ++x) {
                    let v = masterTable[x][y];
                    table[x][y] = Math.round(v + quality * 6 * v);
                }
            }
        }

        return table;
    };

    const quantizerFor = table => {
        if (table == null) {
            throw new Error("requires table");
        } else {
            return function quantize(block) {
                for (let y = 0; y < 8; ++y) {
                    for (let x = 0; x < 8; ++x) {
                        block[x][y] = Math.round(block[x][y] / table[x][y]);
                    }
                }
            }
        }
    };

    const unQuantizerFor = table => {
        if (table == null) {
            throw new Error("requires table");
        } else {
            return function unQuantize(block) {
                for (let y = 0; y < 8; ++y) {
                    for (let x = 0; x < 8; ++x) {
                        block[x][y] *= table[x][y];
                    }
                }
            }
        }
    };

    const drawCompressedImage = (yChannel, outCanvas) => {
        let imData = new ImageData(yChannel.width, yChannel.height);
        let outData = imData.data;
        let yData = yChannel.data;
        let rgb = [];

        let p = 0;
        for (let i = 0; i < yData.length; ++i) {
            rgb[0] = yData[i];
            rgb[1] = yData[i];
            rgb[2] = yData[i];

            outData[p++] = rgb[0];
            outData[p++] = rgb[1];
            outData[p++] = rgb[2];
            outData[p++] = 255;
        }

        outCanvas.getContext('2d').putImageData(imData, 0, 0);
    };

    function ChannelData(width, height, data) {
        this.width = width;
        this.height = height;
        this.data = data;
    }

    const getLuminanceChannel = inCanvas => {
        let w = inCanvas.width;
        let h = inCanvas.height;
        let data = inCanvas.getContext('2d').getImageData(0, 0, w, h).data;
        let Y = [];
        let Cb = [];
        let Cr = [];
        let rgb = [];

        let p = 0, q = 0;
        for (y = 0; y < h; ++y) {
            for (x = 0; x < w; ++x) {
                rgb[0] = data[p++];
                rgb[1] = data[p++];
                rgb[2] = data[p++];
                p++;
                getLuminanceFromRGB(rgb);
                Y[q] = rgb[0];
                Cb[q] = rgb[1];
                Cr[q++] = rgb[2];
            }
        }

        return [new ChannelData(w, h, Y)];
    };

    const convertRGB = () => {

        let yCbCr = getLuminanceChannel(rawCanvas);
        yRaw = yCbCr[0];

        transformToFrequencyDomain();
    };


    let yRaw, yUnQuantized, yQuantized;
    let yRestore;
    let yOut;

    const transformToFrequencyDomain = () => {
        yUnQuantized = forwardDCTChannel(yRaw, spectrumCanvas);

        quantizeFrequencyDomain();
    };

    const quantizeFrequencyDomain = () => {
        let lumQuantized = quantizerFor(updatedTable);

        yQuantized = processBlocks(yUnQuantized, lumQuantized);
        visualizeDCTData(yQuantized, spectrumCanvas);

        unQuantizeFrequencyDomain();
    };

    const unQuantizeFrequencyDomain = () => {
        let lumQuantized = unQuantizerFor(updatedTable);

        yRestore = processBlocks(yQuantized, lumQuantized);
        visualizeDCTData(yRestore, spectrumCanvas);

        transformBackToSpatialDomain();
    };

    const transformBackToSpatialDomain = () => {

        yOut = processBlocks(yRestore, inverseDCT);

        drawCompressedImage(yOut, compCanvas);
        drawImageDiff(diffCanvas);
    };

    const drawImageDiff = outCanvas => {
        let raw = rawCanvas.getContext('2d').getImageData(0, 0, canvasWidth, canvasHeight);
        let compressed = compCanvas.getContext('2d').getImageData(0, 0, canvasWidth, canvasHeight);
        let data1 = raw.data;
        let data2 = compressed.data;
        for (let p = 0; p < data1.length; ++p) {

            let diff = (Math.abs(data1[p] - data2[p]) + Math.abs(data1[p + 1] - data2[p + 1]) + Math.abs(data1[p + 2] - data2[p + 2])) / 3 * 2;

            data1[p++] = 255 - clamp(diff);
            data1[p++] = 255 - clamp(diff);
            data1[p++] = 255 - clamp(diff);
        }
        outCanvas.getContext('2d').putImageData(raw, 0, 0);
    };

});
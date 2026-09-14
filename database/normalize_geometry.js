const fs = require('fs');

const filePath = __dirname + '/ground_floor.json';
const snapDistance = 6;
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const points = data.features.flatMap(feature => {
    const coordinates = feature.geometry.coordinates.flat(Infinity);
    const result = [];

    for (let index = 0; index < coordinates.length; index += 2) {
        result.push([coordinates[index], coordinates[index + 1]]);
    }

    return result;
});

function buildLines(axis) {
    const values = points.map(point => point[axis]).sort((a, b) => a - b);
    const lines = [];

    for (const value of values) {
        const line = lines[lines.length - 1];

        if (!line || value - line[line.length - 1] > snapDistance) {
            lines.push([value]);
        } else {
            line.push(value);
        }
    }

    return lines.map(line => line.reduce((sum, value) => sum + value, 0) / line.length);
}

const lines = [buildLines(0), buildLines(1)];

function snap(value, axis) {
    let closest = value;
    let distance = snapDistance;

    for (const line of lines[axis]) {
        const difference = Math.abs(value - line);

        if (difference < distance) {
            closest = line;
            distance = difference;
        }
    }

    return Number(closest.toFixed(3));
}

function normalizeCoordinates(coordinates) {
    if (typeof coordinates[0] === 'number') {
        return [snap(coordinates[0], 0), snap(coordinates[1], 1)];
    }

    return coordinates.map(normalizeCoordinates);
}

function straightenRing(ring) {
    for (let index = 0; index < ring.length - 1; index += 1) {
        const start = ring[index];
        const end = ring[index + 1];
        const width = Math.abs(end[0] - start[0]);
        const height = Math.abs(end[1] - start[1]);

        if (height <= width * 0.18) {
            end[1] = start[1];
        } else if (width <= height * 0.18) {
            end[0] = start[0];
        }
    }

    ring[ring.length - 1] = [...ring[0]];
}

for (const feature of data.features) {
    feature.geometry.coordinates = normalizeCoordinates(feature.geometry.coordinates);

    if (feature.geometry.type === 'Polygon') {
        const ring = feature.geometry.coordinates[0];
        const first = ring[0];
        const last = ring[ring.length - 1];

        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
        straightenRing(ring);
    }
}

fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
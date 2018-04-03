const int64 = require('node-int64');

class Util {
    /**
     * Sets default properties on an object that aren't already specified.
     * @param {Object} def Default properties
     * @param {Object} given Object to assign default to
     * @return {Object}
     */
    public static mergeDefault(def: Object, given: Object): Object {
        if (!given) return def;

        for (const key in def) {
            //console.debug(`def[${key}]: ${def[key]} -> given[${key}]: ${given[key]}`);

            if (!this.has(given, key) || given[key] === undefined) {
                given[key] = def[key];
                continue;
            }

            if (given[key] === Object(given[key])) {
                given[key] = this.mergeDefault(def[key], given[key]);
            }
        }

        return given;
    }

    /**
     * @param {Object} obj 
     * @param {string} key 
     * @returns {Boolean} 
     */
    public static has(obj: Object, key: String) {
        return Object.prototype.hasOwnProperty.call(obj, key);
    }

    /**
     * Sleeps for a specific time
     * @param {Number} ms 
     * @returns {Promise<any>}
     */
    public static sleep(ms: Number) {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, ms);
        });
    }

    /**
     * @returns {String}
     */
    public static guid() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString()
                .substring(1);
        }

        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    /**
     * @param {string} input 
     * @returns {Boolean} 
     */
    public static isStringNull(input: String) {
        return !input;
    }

    /**
     * @param {string} input 
     * @returns {Boolean} 
     */
    public static isStringWhiteSpace(input: String) {
        if (this.isStringNull(input)) {
            return false;
        }

        if (this.isStringEmpty(input)) {
            return false;
        }

        if (this.isStringEmpty(input.trim())) {
            return true;
        }

        return false;
    }

    /**
     * @param {string} input 
     * @returns {Boolean} 
     */
    public static isStringEmpty(input: String) {
        return input == "";
    }

    /**
     * @param {Buffer} buffer 
     * @param {number} offset 
     */
    public static readChar(buffer: Buffer, offset: number) {
        return buffer.readUInt8(offset);
    }

    /**
     * @param {Buffer} buffer 
     * @param {number} offset 
     */
    public static readShort(buffer: Buffer, offset: number, lowEndian: boolean = true) {
        return lowEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
    }

    /**
     * @param {Buffer} buffer 
     * @param {number} offset 
     */
    public static readLong(buffer: Buffer, offset: number, lowEndian: boolean = true) {
        return lowEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
    }

    /**
     * @param {Buffer} buffer 
     * @param {number} offset 
     */
    public static readLongLong(buffer: Buffer, offset: number) {
        return new int64(buffer, offset);
    }

    public static readString(buffer: Buffer, offset: number, length: number, encoding: string = 'utf8') {
        return buffer.toString(encoding, offset, offset + length);
    }
    }
}

module.exports = {Util};
export { Util };
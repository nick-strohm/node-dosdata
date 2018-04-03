import * as fs from "fs";
import {Util} from "./Util";

class DosDataOptions {
    public debug: boolean = false;
}

class DosData {
    public buffer: Buffer;
    public options: DosDataOptions;

    public dosHeader: DosHeader;
    public coffHeader: CoffHeader;
    public optionalHeader: OptionalHeader;
    private sectionContainer: SectionContainer;

    constructor(buffer: Buffer | string, options: DosDataOptions) {
        if (typeof(buffer) == 'string') {
            buffer = fs.readFileSync(buffer);
        }

        this.buffer = buffer;
        this.options = Util.mergeDefault({
            debug: false
        }, options) as DosDataOptions;

        this.dosHeader = new DosHeader(0, this);
        this.coffHeader = new CoffHeader(this.dosHeader.lfaNew, this);
        this.optionalHeader = new OptionalHeader(this.coffHeader.offset + this.coffHeader.size, this);
        this.sectionContainer = new SectionContainer(this.optionalHeader.offset + this.optionalHeader.size, this);

        this.mapSections();
        this.readResourceSection();

        if (!this.options.debug) {
            return;
        }

        delete this.buffer;
        console.dir(this, {depth: 100});
    }

    private mapSections(): void {
        for (let i = 0; i < this.optionalHeader.dataDirectories.length; i++) {
            const element = this.optionalHeader.dataDirectories[i];
            const section = this.findSectionByVirtualAddress(element.virtualAddress);
            if (section == null) {
                continue;
            }

            element.section = section;
        }

        delete this.sectionContainer;
    }

    private findSectionByVirtualAddress(virtualAddress: number): Section | null {
        for (let i = 0; i < this.sectionContainer.sections.length; i++) {
            const section = this.sectionContainer.sections[i];
            if (section.virtualAddress != virtualAddress) {
                continue;
            }

            return section;
        }

        return null;
    }

    private readResourceSection(): void {        
        if (this.optionalHeader.dataDirectories[2] == null || this.optionalHeader.dataDirectories[2].section == null) {
            return;
        }

        this.optionalHeader.dataDirectories[2].section.data = new ResourceDirectory(this.optionalHeader.dataDirectories[2].section.pointerToRawData, this, {
            rsrcRva: this.optionalHeader.dataDirectories[2].section.pointerToRawData
        });
    }
}

abstract class PointerObject {
    public size: number = 0;

    public offset: number = 0;
    public dosData: DosData;
    public options: Object;

    constructor(offset: number, dosData: DosData, options: Object = {}) {
        this.offset = offset;
        this.dosData = dosData;
        this.options = options;

        this.parse();
    }

    abstract parse(): void;

    private devout(offset: number, value: number | string): void {
        if (!this.dosData.options.debug) {
            return;
        }

        if (typeof(value) == 'string') {
            console.log(`0x${offset.toString(16)} -> ${value}`);
            return;
        }

        console.log(`0x${offset.toString(16)} -> 0x${value.toString(16)}`);
    }

    readChar(): number {
        let value = Util.readChar(this.dosData.buffer, this.offset + this.size);
        this.devout(this.offset + this.size, value);
        this.size += 1;
        return value;
    }

    readShort(lowEndian: boolean = true): number {
        let value = Util.readShort(this.dosData.buffer, this.offset + this.size, lowEndian);
        this.devout(this.offset + this.size, value);
        this.size += 2;
        return value;
    }

    readLong(lowEndian: boolean = true): number {
        let value = Util.readLong(this.dosData.buffer, this.offset + this.size, lowEndian);
        this.devout(this.offset + this.size, value);
        this.size += 4;
        return value;
    }

    readLongLong(): number {
        let value = Util.readLongLong(this.dosData.buffer, this.offset + this.size);
        this.devout(this.offset + this.size, value);
        this.size += 8;
        return value;
    }

    readString(length: number, encoding: string = 'utf8'): string {
        let value = Util.readString(this.dosData.buffer, this.offset + this.size, length, encoding);
        this.devout(this.offset + this.size, value);
        this.size += length;
        return value;
    }

    align(n: number = 4): void {
        while(!Util.isPowerOfTwo(n)) {
            n++;
        }

        this.readShort();

        let bounds = 0;
        while((bounds = (this.offset + this.size) % 4) != 0) {
            console.log(`[Bounding] Offset: ${this.offset} Size: ${this.size} (${this.offset + this.size}) -> ${bounds} -> ${bounds != 0}}`);
            this.readShort();
        }
    }
}

class DosHeader extends PointerObject {
    signature: number;
    lastSize: number;
    numBlocks: number;
    numReloc: number;
    headerSize: number;
    minAlloc: number;
    maxAlloc: number;
    ss: number;
    sp: number;
    checkSum: number;
    ip: number;
    cs: number;
    relocPos: number;
    numOverlay: number;
    reserved1: number[];
    oemId: number;
    oemInfo: number;
    reserved2: number[];
    lfaNew: number;

    parse(): void {
        this.signature = this.readShort();
        this.lastSize = this.readShort();
        this.numBlocks = this.readShort();
        this.numReloc = this.readShort();
        this.headerSize = this.readShort();
        this.minAlloc = this.readShort();
        this.maxAlloc = this.readShort();
        this.ss = this.readShort();
        this.sp = this.readShort();
        this.checkSum = this.readShort();
        this.ip = this.readShort();
        this.cs = this.readShort();
        this.relocPos = this.readShort();
        this.numOverlay = this.readShort();
        this.reserved1 = [
            this.readShort(),
            this.readShort(),
            this.readShort(),
            this.readShort(),
        ];
        this.oemId = this.readShort();
        this.oemInfo = this.readShort();
        this.reserved2 = [
            this.readShort(),
            this.readShort(),
            this.readShort(),
            this.readShort(),
            this.readShort(),
            this.readShort(),
            this.readShort(),
            this.readShort(),
            this.readShort(),
            this.readShort()
        ];
        this.lfaNew = this.readLong();
    }
}

enum Machine {
    Intel386                       = 0x14c,
    x64                            = 0x8664,
    MipsR3000                      = 0x162,
    MipsR10000                     = 0x168,
    MipsLittleEndianWciV2          = 0x169,
    OldAlphaAxp                    = 0x183,
    AlphaAxp                       = 0x184,
    HitachiSh3                     = 0x1a2,
    HitachiSh3Dsp                  = 0x1a3,
    HitachiSh4                     = 0x1a6,
    HitachiSh5                     = 0x1a8,
    ArmLittleEndian                = 0x1c0,
    Thumb                          = 0x1c2,
    ArmV7                          = 0x1c4,
    MatsushitaAm33                 = 0x1d3,
    PowerPcLittleEndian            = 0x1f0,
    PowerPcWihFloatingPointSupport = 0x1f1,
    IntalIa64                      = 0x200,
    Mips16                         = 0x266,
    Motorola68000Series            = 0x268,
    AlphaAxp64                     = 0x284,
    MipsWithFpu                    = 0x366,
    Mips16WithFpu                  = 0x466,
    EfiByteCode                    = 0xebc,
    Amd64                          = 0x8664,
    MitsubishiM32RLittleEndian     = 0x9041,
    Arm64LittleEndian              = 0xaa64,
    ClrPureMsil                    = 0xc0ee
}

enum CoffCharacteristic {
    RelocsStripped       = 1 << 0,
    ExecutableImage      = 1 << 1,
    LineNumsStripped     = 1 << 2,
    LocalSymsStripped    = 1 << 3,
    AggresiveWsTrim      = 1 << 4,
    LargeAddressAware    = 1 << 5,
    BytesReversedLo      = 1 << 7,
    '32BitMachine'       = 1 << 8,
    DebugStripped        = 1 << 9,
    RemovableRunFromSwap = 1 << 10,
    NetRunFromSwap       = 1 << 11,
    System               = 1 << 12,
    Dll                  = 1 << 13,
    UpSystemOnly         = 1 << 14,
    BytesReversedHi      = 1 << 15
}

class CoffHeader extends PointerObject {
    public size: number = 24;

    public static peSignature: number = 0x00004550;

    public signature: number;
    public machine: Machine;
    public numberOfSections: number;
    public timeDateStamp: number;
    public pointerToSymbolTable: number;
    public numberOfSymbols: number;
    public sizeOfOptionalHeader: number;
    public characteristics: CoffCharacteristic;

    parse(): void {
        this.signature = this.readLong();
        this.machine = this.readShort();
        this.numberOfSections = this.readShort();
        this.timeDateStamp = this.readLong();
        this.pointerToSymbolTable = this.readLong();
        this.numberOfSymbols = this.readLong();
        this.sizeOfOptionalHeader = this.readShort();
        this.characteristics = this.readShort();
    }
}

enum PeFormat {
    Win32 = 0x10b,
    Win64 = 0x20b,
    Rom   = 0x107
}

enum Subsystem {
    Unknown                =  0,
    Native                 =  1,
    WindowsGui             =  2,
    WindowsCui             =  3,
    Os2Cui                 =  5,
    PosixCui               =  7,
    NativeWindows          =  8,
    WindowsCuiGui          =  9,
    EfiApplication         = 10,
    EfiBootServiceDriver   = 11,
    EfiRuntimeDriver       = 12,
    EfiRom                 = 13,
    Xbox                   = 14,
    WindowsBootApplication = 15
}

enum DllCharacteristics {
    Reserved1           = 1 << 0,
    Reserved2           = 1 << 1,
    Reserved3           = 1 << 2,
    Reserved4           = 1 << 3,
    HighEntropyVa       = 1 << 5,
    DynamicBase         = 1 << 6,
    ForceIntegrity      = 1 << 7,
    NxCompat            = 1 << 8,
    NoIsolation         = 1 << 9,
    NoSeh               = 1 << 10,
    NoBind              = 1 << 11,
    Appcontainer        = 1 << 12,
    WdmDriver           = 1 << 13,
    GuardCf             = 1 << 14,
    TerminalServerAware = 1 << 15
}

class DataDirectory extends PointerObject {
    public virtualAddress: number;
    public dictSize: number;

    public section: Section;

    parse(): void {
        this.virtualAddress = this.readLong();
        this.dictSize = this.readLong();
    }
}

class OptionalHeader extends PointerObject {
    public signature: PeFormat;
    public majorLinkerVersion: number;
    public minorLinkerVersion: number;
    public sizeOfcode: number;
    public sizeOfInitializedData: number;
    public sizeOfUninitializedData: number;
    public addressOfEntryPoint: number;
    public baseOfCode: number;
    public baseOfData: number;
    public imageBase: number;
    public sectionAlignment: number;
    public fileAlignment: number;
    public majorOsVersion: number;
    public minorOsVersion: number;
    public majorImageVersion: number;
    public minorImageVersion: number;
    public majorSubsystemVersion: number;
    public minorSubsystemVersion: number;
    public win32Version: number
    public sizeOfImage: number;
    public sizeOfHeaders: number;
    public checkSum: number;
    public subsystem: Subsystem;
    public dllCharacteristics: DllCharacteristics;
    public sizeOfStackReserve: number;
    public sizeOfStackCommit: number;
    public sizeOfHeapReserve: number;
    public sizeOfHeapCommit: number;
    public loaderFlags: number;
    public numberOfRvaAndSizes: number;

    public dataDirectories: DataDirectory[];

    parse(): void {
        this.signature = this.readShort();
        if (this.signature == PeFormat.Win64) {
            this.majorLinkerVersion = this.readChar();
            this.minorLinkerVersion = this.readChar();
            this.sizeOfcode = this.readLong();
            this.sizeOfInitializedData = this.readLong();
            this.sizeOfUninitializedData = this.readLong();
            this.addressOfEntryPoint = this.readLong();
            this.baseOfCode = this.readLong();
            this.baseOfData = 0;
            this.imageBase = this.readLongLong();
            this.sectionAlignment = this.readLong();
            this.fileAlignment = this.readLong();
            this.majorOsVersion = this.readShort();
            this.minorOsVersion = this.readShort();
            this.majorImageVersion = this.readShort();
            this.minorImageVersion = this.readShort();
            this.majorSubsystemVersion = this.readShort();
            this.minorSubsystemVersion = this.readShort();
            this.win32Version = this.readLong();
            this.sizeOfImage = this.readLong();
            this.sizeOfHeaders = this.readLong();
            this.checkSum = this.readLong();
            this.subsystem = this.readShort();
            this.dllCharacteristics = this.readShort();
            this.sizeOfStackReserve = this.readLongLong();
            this.sizeOfStackCommit = this.readLongLong();
            this.sizeOfHeapReserve = this.readLongLong();
            this.sizeOfHeapCommit = this.readLongLong();
            this.loaderFlags = this.readLong();
            this.numberOfRvaAndSizes = this.readLong();

            this.readDataDirectories();
            
            return;
        }
        
        this.majorLinkerVersion = this.readChar();
        this.minorLinkerVersion = this.readChar();
        this.sizeOfcode = this.readLong();
        this.sizeOfInitializedData = this.readLong();
        this.sizeOfUninitializedData = this.readLong();
        this.addressOfEntryPoint = this.readLong();
        this.baseOfCode = this.readLong();
        this.baseOfData = this.readLong();
        this.imageBase = this.readLong();
        this.sectionAlignment = this.readLong();
        this.fileAlignment = this.readLong();
        this.majorOsVersion = this.readShort();
        this.minorOsVersion = this.readShort();
        this.majorImageVersion = this.readShort();
        this.minorImageVersion = this.readShort();
        this.majorSubsystemVersion = this.readShort();
        this.minorSubsystemVersion = this.readShort();
        this.win32Version = this.readLong();
        this.sizeOfImage = this.readLong();
        this.sizeOfHeaders = this.readLong();
        this.checkSum = this.readLong();
        this.subsystem = this.readShort();
        this.dllCharacteristics = this.readShort();
        this.sizeOfStackReserve = this.readLong();
        this.sizeOfStackCommit = this.readLong();
        this.sizeOfHeapReserve = this.readLong();
        this.sizeOfHeapCommit = this.readLong();
        this.loaderFlags = this.readLong();
        this.numberOfRvaAndSizes = this.readLong();

        this.readDataDirectories();
    }

    public readDataDirectories(): void {
        this.dataDirectories = [];
        for (let i = 0; i < this.numberOfRvaAndSizes; i++) {
            let element = new DataDirectory(this.offset + this.size, this.dosData);
            this.size = this.size + element.size;
            this.dataDirectories.push(element);
        }
    }
}

class Section extends PointerObject {
    public name: string;
    public virtualSize: number;
    public virtualAddress: number;
    public sizeOfRawData: number;
    public pointerToRawData: number;
    public pointerToRelocations: number;
    public pointerToLineNumbers: number;
    public numberOfRelocations: number;
    public numberOfLineNumbers: number;
    public characteristics: number;

    public data: object;

    parse(): void {
        this.name = this.readString(8);
        this.virtualSize = this.readLong();
        this.virtualAddress = this.readLong();
        this.sizeOfRawData = this.readLong();
        this.pointerToRawData = this.readLong();
        this.pointerToRelocations = this.readLong();
        this.pointerToLineNumbers = this.readLong();
        this.numberOfRelocations = this.readShort();
        this.numberOfLineNumbers = this.readShort();
        this.characteristics = this.readLong();
    }
}

class SectionContainer extends PointerObject {
    public sections: Section[];

    parse(): void {
        this.sections = [];
        
        for (let i = 0; i < this.dosData.coffHeader.numberOfSections; i++) {
            let section = new Section(this.offset + this.size, this.dosData);
            this.size += section.size;
            this.sections.push(section);
        }
    }
}

class VsFixedFileInfo extends PointerObject {
    public signature: number;
    public structureVersion: number;
    public fileVersionMs: number;
    public fileVersionLs: number;
    public productVersionMs: number;
    public productVersionLs: number;
    public fileFlagsMask: number;
    public fileFlags: number;
    public fileOs: number;
    public fileType: number;
    public fileSubtype: number;
    public fileDateMs: number;
    public fileDateLs: number;

    parse(): void {
        this.signature = this.readLong();
        this.structureVersion = this.readLong();
        this.fileVersionMs = this.readLong();
        this.fileVersionLs = this.readLong();
        this.productVersionMs = this.readLong();
        this.productVersionLs = this.readLong();
        this.fileFlagsMask = this.readLong();
        this.fileFlags = this.readLong();
        this.fileOs = this.readLong();
        this.fileType = this.readLong();
        this.fileSubtype = this.readLong();
        this.fileDateMs = this.readLong();
        this.fileDateLs = this.readLong();
    }
}

class MsString extends PointerObject {
    public length: number;
    public valueLength: number;
    public type: number;
    public key: string;
    public value: string;

    parse(): void {
        this.length = this.readShort();
        this.valueLength = this.readShort();
        this.type = this.readShort();
        return;
        this.key = this.readString('Comments'.length * 2, 'utf16le');
        if (this.key != 'Comments') {
            this.size -= 'Comments'.length * 2;
            this.key = this.readString('CompanyName'.length * 2, 'utf16le');

            if (this.key != 'CompanyName') {
                this.size -= 'CompanyName'.length * 2;
                this.key = this.readString('FileDescription'.length * 2, 'utf16le');
        
                if (this.key != 'FileDescription') {
                    this.size -= 'FileDescription'.length * 2;
                    this.key = this.readString('FileVersion'.length * 2, 'utf16le');
        
                    if (this.key != 'FileVersion') {
                        this.size -= 'FileVersion'.length * 2;
                        this.key = this.readString('InternalName'.length * 2, 'utf16le');
        
                        if (this.key != 'InternalName') {
                            this.size -= 'InternalName'.length * 2;
                            this.key = this.readString('LegalCopyright'.length * 2, 'utf16le');
        
                            if (this.key != 'LegalCopyright') {
                                this.size -= 'LegalCopyright'.length * 2;
                                this.key = this.readString('LegalTrademarks'.length * 2, 'utf16le');
        
                                if (this.key != 'LegalTrademarks') {
                                    this.size -= 'LegalTrademarks'.length * 2;
                                    this.key = this.readString('OriginalFilename'.length * 2, 'utf16le');
        
                                    if (this.key != 'OriginalFilename') {
                                        this.size -= 'OriginalFilename'.length * 2;
                                        this.key = this.readString('PrivateBuild'.length * 2, 'utf16le');
        
                                        if (this.key != 'PrivateBuild') {
                                            this.size -= 'PrivateBuild'.length * 2;
                                            this.key = this.readString('ProductName'.length * 2, 'utf16le');
        
                                            if (this.key != 'ProductName') {
                                                this.size -= 'ProductName'.length * 2;
                                                this.key = this.readString('ProductVersion'.length * 2, 'utf16le');
        
                                                if (this.key != 'ProductVersion') {
                                                    this.size -= 'ProductVersion'.length * 2;
                                                    this.key = this.readString('SpecialBuild'.length * 2, 'utf16le');

                                                    if (this.key != 'SpecialBuild') {
                                                        throw new TypeError('A string with this key is not supported.');
                                                        return;

                                                        // Sorry for this ugly shit lol
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        this.align();

        this.value = this.readString(this.valueLength, 'utf16le');
    }
}

class StringTable extends PointerObject {
    public length: number;
    public valueLength: number;
    public type: number;
    public key: string;
    public children: MsString[];

    parse(): void {
        this.length = this.readShort();
        this.valueLength = this.readShort();
        this.type = this.readShort();
        this.key = this.readString(16, 'utf16le');

        this.align();

        this.children = [];
        while(this.size < this.length) {
            const element = new MsString(this.offset + this.size, this.dosData, this.options);
            this.size += element.size;
            this.children.push(element);
        }
    }
}

class Var extends PointerObject {
    public length: number;
    public valueLength: number;
    public type: number;
    public key: string;
    public children: number[];

    parse(): void {
        this.length = this.readShort();
        this.valueLength = this.readShort();
        this.type = this.readShort();
        this.key = this.readString('Translation'.length * 2, 'utf16le');

        this.align();

        this.children = [];
        while (this.size < this.length) {
            const element = this.readLong();
            this.children.push(element);
        }
    }
}

class FileInfo extends PointerObject {
    public length: number;
    public valueLength: number;
    public type: number;
    public key: string;
    public children: Object[];

    public isVarFileInfo: boolean = false;

    parse(): void {
        this.length = this.readShort();
        this.valueLength = this.readShort();
        this.type = this.readShort();
        this.key = this.readString('VarFileInfo'.length * 2, 'utf16le');
        if (this.key == 'VarFileInfo') {
            this.isVarFileInfo = true;
        } else {
            this.size -= 22;
            this.key = this.readString('StringFileInfo'.length * 2, 'utf16le');

            if (this.key != 'StringFileInfo') {
                throw new TypeError('Expected VarFileInfo or StringFileInfo in VsVersionInfo.');
            }
        }

        this.align();

        this.children = [];
        while(this.size < this.length) {
            if (this.isVarFileInfo) {
                const element = new Var(this.offset + this.size, this.dosData, this.options);
                this.size += element.size;
                this.children.push(element);
                continue;
            }

            const element = new StringTable(this.offset + this.size, this.dosData, this.options);
            this.size += element.size;
            this.children.push(element);
        }
    }
}

class VsVersionInfo extends PointerObject {
    public length: number;
    public valueLength: number;
    public type: number;
    public key: string;
    public value: VsFixedFileInfo;
    public children: FileInfo[];

    parse(): void {
        this.length = this.readShort();
        this.valueLength = this.readShort();
        this.type = this.readShort();
        this.key = this.readString(30, 'utf16le');

        this.align();

        if (this.valueLength != 0) {
            this.value = new VsFixedFileInfo(this.offset + this.size, this.dosData, this.options);
            this.size += this.value.size;
        }

        this.children = [];
        while(this.size < this.length) {
            let child = new FileInfo(this.offset + this.size, this.dosData, this.options);
            this.size += child.size;
            this.children.push(child);
        }
    }
}

class ResourceDataEntry extends PointerObject {
    public dataOffset: number;
    public entrySize: number;
    public codePage: number;
    public reserved: number;

    public vsVersionInfo: VsVersionInfo;

    parse(): void {
        let rsrcOffset: number = this.options['rsrcRva'];

        this.dataOffset = (this.readLong() & 0x00FF);
        this.entrySize = this.readLong();
        this.codePage = this.readLong();
        this.reserved = this.readLong();
    }
}

class ResourceDirectoryEntry extends PointerObject {
    public nameId: number;
    public dataOffset: number;
    public data: object;

    public isNamedEntry: boolean;
    public isDirectoryEntry: boolean;

    parse(): void {
        let rsrcOffset: number = this.options['rsrcRva'];

        this.nameId = this.readLong();
        this.dataOffset = this.readLong();

        this.isNamedEntry = (this.nameId & 0x80000000) != 0;
        this.isDirectoryEntry = (this.dataOffset & 0x80000000) != 0;

        if (this.isDirectoryEntry) {
            this.data = new ResourceDirectory(rsrcOffset + (this.dataOffset & 0x7FFFFFFF), this.dosData, this.options);
        } else {
            this.data = new ResourceDataEntry(rsrcOffset + (this.dataOffset & 0x0000FFFF), this.dosData, this.options);
        }
    }
}

class ResourceDirectory extends PointerObject {
    public characteristics: number;
    public timeDateStamp: number;
    public majorVersion: number;
    public minorVersion: number;
    public numberOfNamedEntries: number;
    public numberOfIdEntries: number;

    public entries: ResourceDirectoryEntry[];

    parse(): void {
        this.characteristics = this.readLong();
        this.timeDateStamp = this.readLong();
        this.majorVersion = this.readShort();
        this.minorVersion = this.readShort();
        this.numberOfNamedEntries = this.readShort();
        this.numberOfIdEntries = this.readShort();

        this.entries = [];
        for (let i = 0; i < this.numberOfNamedEntries + this.numberOfIdEntries; i++) {
            const directoryEntry = new ResourceDirectoryEntry(this.offset + this.size, this.dosData, this.options);
            this.size += directoryEntry.size;
            this.entries.push(directoryEntry);
        }
    }
}

export {DosDataOptions, PointerObject, DosHeader, CoffCharacteristic, Machine, CoffHeader, PeFormat, Subsystem, DllCharacteristics, DataDirectory, OptionalHeader, Section, SectionContainer, DosData};
module.exports = {DosDataOptions, PointerObject, DosHeader, CoffCharacteristic, Machine, CoffHeader, PeFormat, Subsystem, DllCharacteristics, DataDirectory, OptionalHeader, Section, SectionContainer, DosData};
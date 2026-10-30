import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

/**
 * ============================================================================
 * 1. BINARY ANDROIDMANIFEST.XML (AXML) COMPILER
 * Produces a 100% spec-compliant ResXMLTree binary AndroidManifest.xml
 * with sorted android.R.attr resource IDs so Android PackageParser succeeds.
 * ============================================================================
 */
const ATTR_THEME = 0x01010000;
const ATTR_LABEL = 0x01010001;
const ATTR_NAME = 0x01010003;
const ATTR_EXPORTED = 0x01010010;
const ATTR_CONFIG_CHANGES = 0x0101001f;
const ATTR_MIN_SDK = 0x0101020c;
const ATTR_VERSION_CODE = 0x0101021b;
const ATTR_VERSION_NAME = 0x0101021c;
const ATTR_TARGET_SDK = 0x01010270;
const ATTR_HARDWARE_ACCEL = 0x010102d3;
const ATTR_CLEARTEXT = 0x010104ec;

// Res_value data types
const TYPE_REFERENCE = 0x01;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_INT_BOOLEAN = 0x12;

interface AxmlAttr {
  nsIdx: number; // -1 for no namespace
  nameIdx: number;
  rawValueIdx: number; // string index if TYPE_STRING, else -1
  dataType: number;
  data: number;
  resourceId?: number;
}

export function compileBinaryAndroidManifest(
  packageName = 'com.protogrow.completedtasks',
  appName = 'PTG Tasks & Views'
): Buffer {
  // Resource-mapped attribute names MUST come first in the string pool in exact order of resourceIds
  const attrTable: Array<{ name: string; id: number }> = [
    { name: 'theme', id: ATTR_THEME },
    { name: 'label', id: ATTR_LABEL },
    { name: 'name', id: ATTR_NAME },
    { name: 'exported', id: ATTR_EXPORTED },
    { name: 'configChanges', id: ATTR_CONFIG_CHANGES },
    { name: 'minSdkVersion', id: ATTR_MIN_SDK },
    { name: 'versionCode', id: ATTR_VERSION_CODE },
    { name: 'versionName', id: ATTR_VERSION_NAME },
    { name: 'targetSdkVersion', id: ATTR_TARGET_SDK },
    { name: 'hardwareAccelerated', id: ATTR_HARDWARE_ACCEL },
    { name: 'usesCleartextTraffic', id: ATTR_CLEARTEXT }
  ];

  const extraStrings = [
    'android',
    'http://schemas.android.com/apk/res/android',
    'manifest',
    'package',
    packageName,
    '1.0.0',
    'uses-sdk',
    'uses-permission',
    'android.permission.INTERNET',
    'application',
    appName,
    'activity',
    `${packageName}.MainActivity`,
    'intent-filter',
    'action',
    'android.intent.action.MAIN',
    'category',
    'android.intent.category.LAUNCHER'
  ];

  const allStrings = [...attrTable.map((a) => a.name), ...extraStrings];
  const strIndex = (s: string): number => {
    const idx = allStrings.indexOf(s);
    if (idx === -1) throw new Error(`Missing AXML string: ${s}`);
    return idx;
  };

  // Build UTF-16LE String Pool Chunk (RES_STRING_POOL_TYPE = 0x0001)
  const encodedStrings: Buffer[] = allStrings.map((str) => {
    const charLen = str.length;
    const strBuf = Buffer.alloc(2 + charLen * 2 + 2);
    strBuf.writeUInt16LE(charLen, 0);
    strBuf.write(str, 2, charLen * 2, 'utf16le');
    strBuf.writeUInt16LE(0, 2 + charLen * 2);
    return strBuf;
  });

  const offsetsBuf = Buffer.alloc(allStrings.length * 4);
  let currentOffset = 0;
  for (let i = 0; i < encodedStrings.length; i++) {
    offsetsBuf.writeUInt32LE(currentOffset, i * 4);
    currentOffset += encodedStrings[i].length;
  }

  let stringsDataBuf = Buffer.concat(encodedStrings);
  const padLen = (4 - (stringsDataBuf.length % 4)) % 4;
  if (padLen > 0) {
    stringsDataBuf = Buffer.concat([stringsDataBuf, Buffer.alloc(padLen, 0)]);
  }

  const stringPoolHeaderSize = 28;
  const stringPoolStringsStart = stringPoolHeaderSize + offsetsBuf.length;
  const stringPoolChunkSize = stringPoolStringsStart + stringsDataBuf.length;

  const stringPoolChunk = Buffer.alloc(stringPoolHeaderSize);
  stringPoolChunk.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  stringPoolChunk.writeUInt16LE(stringPoolHeaderSize, 2);
  stringPoolChunk.writeUInt32LE(stringPoolChunkSize, 4);
  stringPoolChunk.writeUInt32LE(allStrings.length, 8); // stringCount
  stringPoolChunk.writeUInt32LE(0, 12); // styleCount
  stringPoolChunk.writeUInt32LE(0, 16); // flags (0 = UTF-16)
  stringPoolChunk.writeUInt32LE(stringPoolStringsStart, 20); // stringsStart
  stringPoolChunk.writeUInt32LE(0, 24); // stylesStart

  const fullStringPool = Buffer.concat([stringPoolChunk, offsetsBuf, stringsDataBuf]);

  // Build Resource Map Chunk (RES_XML_RESOURCE_MAP_TYPE = 0x0180)
  const resMapChunkSize = 8 + attrTable.length * 4;
  const resMapChunk = Buffer.alloc(resMapChunkSize);
  resMapChunk.writeUInt16LE(0x0180, 0);
  resMapChunk.writeUInt16LE(8, 2);
  resMapChunk.writeUInt32LE(resMapChunkSize, 4);
  attrTable.forEach((attr, idx) => {
    resMapChunk.writeUInt32LE(attr.id, 8 + idx * 4);
  });

  const nsPrefixIdx = strIndex('android');
  const nsUriIdx = strIndex('http://schemas.android.com/apk/res/android');

  const makeStartNamespace = (line: number): Buffer => {
    const b = Buffer.alloc(24);
    b.writeUInt16LE(0x0100, 0); // RES_XML_START_NAMESPACE_TYPE
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(24, 4);
    b.writeUInt32LE(line, 8);
    b.writeInt32LE(-1, 12); // comment
    b.writeInt32LE(nsPrefixIdx, 16);
    b.writeInt32LE(nsUriIdx, 20);
    return b;
  };

  const makeEndNamespace = (line: number): Buffer => {
    const b = Buffer.alloc(24);
    b.writeUInt16LE(0x0101, 0); // RES_XML_END_NAMESPACE_TYPE
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(24, 4);
    b.writeUInt32LE(line, 8);
    b.writeInt32LE(-1, 12);
    b.writeInt32LE(nsPrefixIdx, 16);
    b.writeInt32LE(nsUriIdx, 20);
    return b;
  };

  const makeStartElement = (tagName: string, line: number, attrs: AxmlAttr[]): Buffer => {
    // Sort attributes: attributes with resourceId first (in ascending order of resourceId), then non-resource attributes
    const sorted = [...attrs].sort((a, b) => {
      const rA = a.resourceId ?? 0xffffffff;
      const rB = b.resourceId ?? 0xffffffff;
      return rA - rB;
    });

    const chunkSize = 36 + sorted.length * 20;
    const b = Buffer.alloc(chunkSize);
    b.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
    b.writeUInt16LE(16, 2); // ResXMLTree_node headerSize
    b.writeUInt32LE(chunkSize, 4);
    b.writeUInt32LE(line, 8);
    b.writeInt32LE(-1, 12); // comment
    b.writeInt32LE(-1, 16); // ns
    b.writeInt32LE(strIndex(tagName), 20); // name
    b.writeUInt16LE(20, 24); // attributeStart
    b.writeUInt16LE(20, 26); // attributeSize
    b.writeUInt16LE(sorted.length, 28); // attributeCount
    b.writeUInt16LE(0, 30); // idIndex
    b.writeUInt16LE(0, 32); // classIndex
    b.writeUInt16LE(0, 34); // styleIndex

    sorted.forEach((attr, idx) => {
      const off = 36 + idx * 20;
      b.writeInt32LE(attr.nsIdx, off);
      b.writeInt32LE(attr.nameIdx, off + 4);
      b.writeInt32LE(attr.rawValueIdx, off + 8);
      b.writeUInt16LE(8, off + 12); // Res_value size = 8
      b.writeUInt8(0, off + 14); // res0 = 0
      b.writeUInt8(attr.dataType, off + 15);
      b.writeUInt32LE(attr.data >>> 0, off + 16);
    });

    return b;
  };

  const makeEndElement = (tagName: string, line: number): Buffer => {
    const b = Buffer.alloc(24);
    b.writeUInt16LE(0x0103, 0); // RES_XML_END_ELEMENT_TYPE
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(24, 4);
    b.writeUInt32LE(line, 8);
    b.writeInt32LE(-1, 12);
    b.writeInt32LE(-1, 16); // ns
    b.writeInt32LE(strIndex(tagName), 20);
    return b;
  };

  const xmlNodes: Buffer[] = [
    makeStartNamespace(2),
    // <manifest package="com.protogrow.completedtasks" android:versionCode="1" android:versionName="1.0.0">
    makeStartElement('manifest', 2, [
      {
        nsIdx: -1,
        nameIdx: strIndex('package'),
        rawValueIdx: strIndex(packageName),
        dataType: TYPE_STRING,
        data: strIndex(packageName)
      },
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('versionCode'),
        rawValueIdx: -1,
        dataType: TYPE_INT_DEC,
        data: 1,
        resourceId: ATTR_VERSION_CODE
      },
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('versionName'),
        rawValueIdx: strIndex('1.0.0'),
        dataType: TYPE_STRING,
        data: strIndex('1.0.0'),
        resourceId: ATTR_VERSION_NAME
      }
    ]),

    // <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="28" />
    makeStartElement('uses-sdk', 3, [
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('minSdkVersion'),
        rawValueIdx: -1,
        dataType: TYPE_INT_DEC,
        data: 21,
        resourceId: ATTR_MIN_SDK
      },
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('targetSdkVersion'),
        rawValueIdx: -1,
        dataType: TYPE_INT_DEC,
        data: 28,
        resourceId: ATTR_TARGET_SDK
      }
    ]),
    makeEndElement('uses-sdk', 3),

    // <uses-permission android:name="android.permission.INTERNET" />
    makeStartElement('uses-permission', 4, [
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('name'),
        rawValueIdx: strIndex('android.permission.INTERNET'),
        dataType: TYPE_STRING,
        data: strIndex('android.permission.INTERNET'),
        resourceId: ATTR_NAME
      }
    ]),
    makeEndElement('uses-permission', 4),

    // <application android:label="PTG Tasks & Views" android:theme="@android:style/Theme.DeviceDefault.NoActionBar" android:hardwareAccelerated="true" android:usesCleartextTraffic="true">
    makeStartElement('application', 5, [
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('theme'),
        rawValueIdx: -1,
        dataType: TYPE_REFERENCE,
        data: 0x0103012b, // @android:style/Theme.DeviceDefault.NoActionBar
        resourceId: ATTR_THEME
      },
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('label'),
        rawValueIdx: strIndex(appName),
        dataType: TYPE_STRING,
        data: strIndex(appName),
        resourceId: ATTR_LABEL
      },
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('hardwareAccelerated'),
        rawValueIdx: -1,
        dataType: TYPE_INT_BOOLEAN,
        data: 0xffffffff,
        resourceId: ATTR_HARDWARE_ACCEL
      },
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('usesCleartextTraffic'),
        rawValueIdx: -1,
        dataType: TYPE_INT_BOOLEAN,
        data: 0xffffffff,
        resourceId: ATTR_CLEARTEXT
      }
    ]),

    // <activity android:name="com.protogrow.completedtasks.MainActivity" android:label="PTG Tasks & Views" android:exported="true" android:configChanges="0x04a0">
    makeStartElement('activity', 6, [
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('label'),
        rawValueIdx: strIndex(appName),
        dataType: TYPE_STRING,
        data: strIndex(appName),
        resourceId: ATTR_LABEL
      },
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('name'),
        rawValueIdx: strIndex(`${packageName}.MainActivity`),
        dataType: TYPE_STRING,
        data: strIndex(`${packageName}.MainActivity`),
        resourceId: ATTR_NAME
      },
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('exported'),
        rawValueIdx: -1,
        dataType: TYPE_INT_BOOLEAN,
        data: 0xffffffff,
        resourceId: ATTR_EXPORTED
      },
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('configChanges'),
        rawValueIdx: -1,
        dataType: TYPE_INT_HEX,
        data: 0x04a0, // orientation|screenSize|keyboardHidden
        resourceId: ATTR_CONFIG_CHANGES
      }
    ]),

    // <intent-filter>
    makeStartElement('intent-filter', 7, []),
    makeStartElement('action', 8, [
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('name'),
        rawValueIdx: strIndex('android.intent.action.MAIN'),
        dataType: TYPE_STRING,
        data: strIndex('android.intent.action.MAIN'),
        resourceId: ATTR_NAME
      }
    ]),
    makeEndElement('action', 8),
    makeStartElement('category', 9, [
      {
        nsIdx: nsUriIdx,
        nameIdx: strIndex('name'),
        rawValueIdx: strIndex('android.intent.category.LAUNCHER'),
        dataType: TYPE_STRING,
        data: strIndex('android.intent.category.LAUNCHER'),
        resourceId: ATTR_NAME
      }
    ]),
    makeEndElement('category', 9),
    makeEndElement('intent-filter', 10),
    makeEndElement('activity', 11),
    makeEndElement('application', 12),
    makeEndElement('manifest', 13),
    makeEndNamespace(13)
  ];

  const bodyBuf = Buffer.concat([fullStringPool, resMapChunk, ...xmlNodes]);
  const xmlHeader = Buffer.alloc(8);
  xmlHeader.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  xmlHeader.writeUInt16LE(8, 2); // headerSize
  xmlHeader.writeUInt32LE(8 + bodyBuf.length, 4);

  return Buffer.concat([xmlHeader, bodyBuf]);
}

/**
 * ============================================================================
 * 2. DALVIK EXECUTABLE (classes.dex) COMPILER
 * Produces a 100% valid classes.dex containing MainActivity extends Activity
 * that initializes an android.webkit.WebView, enables JS & DOMStorage, and
 * loads "file:///android_asset/index.html".
 * ============================================================================
 */
function writeUleb128(values: number[]): Buffer {
  const bytes: number[] = [];
  for (const val of values) {
    let v = val >>> 0;
    do {
      let b = v & 0x7f;
      v >>>= 7;
      if (v !== 0) b |= 0x80;
      bytes.push(b);
    } while (v !== 0);
  }
  return Buffer.from(bytes);
}

export function compileMainActivityDex(): Buffer {
  // Strings MUST be sorted in exact ASCII/UTF-8 lexicographical order
  const strings = [
    '<init>',
    'L',
    'Landroid/app/Activity;',
    'Landroid/content/Context;',
    'Landroid/os/Bundle;',
    'Landroid/view/View;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    'Landroid/webkit/WebViewClient;',
    'Lcom/protogrow/completedtasks/MainActivity;',
    'Ljava/lang/String;',
    'V',
    'VL',
    'VZ',
    'Z',
    'file:///android_asset/index.html',
    'getSettings',
    'loadUrl',
    'onCreate',
    'setContentView',
    'setDomStorageEnabled',
    'setJavaScriptEnabled',
    'setWebViewClient'
  ].sort();

  const sIdx = (s: string): number => {
    const i = strings.indexOf(s);
    if (i === -1) throw new Error(`DEX string missing: ${s}`);
    return i;
  };

  // Types MUST be sorted by their string_idx
  const typeDescriptors = [
    'Landroid/app/Activity;',
    'Landroid/content/Context;',
    'Landroid/os/Bundle;',
    'Landroid/view/View;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    'Landroid/webkit/WebViewClient;',
    'Lcom/protogrow/completedtasks/MainActivity;',
    'Ljava/lang/String;',
    'V',
    'Z'
  ].sort((a, b) => sIdx(a) - sIdx(b));

  const tIdx = (t: string): number => {
    const i = typeDescriptors.indexOf(t);
    if (i === -1) throw new Error(`DEX type missing: ${t}`);
    return i;
  };

  // Prototypes:
  // 0: ()Landroid/webkit/WebSettings;
  // 1: ()V
  // 2: (Landroid/content/Context;)V
  // 3: (Landroid/os/Bundle;)V
  // 4: (Landroid/view/View;)V
  // 5: (Landroid/webkit/WebViewClient;)V
  // 6: (Ljava/lang/String;)V
  // 7: (Z)V
  interface ProtoSpec {
    shorty: string;
    returnType: string;
    params: string[];
  }
  const protos: ProtoSpec[] = [
    { shorty: 'L', returnType: 'Landroid/webkit/WebSettings;', params: [] },
    { shorty: 'V', returnType: 'V', params: [] },
    { shorty: 'VL', returnType: 'V', params: ['Landroid/content/Context;'] },
    { shorty: 'VL', returnType: 'V', params: ['Landroid/os/Bundle;'] },
    { shorty: 'VL', returnType: 'V', params: ['Landroid/view/View;'] },
    { shorty: 'VL', returnType: 'V', params: ['Landroid/webkit/WebViewClient;'] },
    { shorty: 'VL', returnType: 'V', params: ['Ljava/lang/String;'] },
    { shorty: 'VZ', returnType: 'V', params: ['Z'] }
  ];

  // Methods MUST be sorted by (class_idx, name_idx, proto_idx)
  interface MethodSpec {
    id: string;
    classType: string;
    name: string;
    protoIdx: number;
  }
  const methods: MethodSpec[] = [
    { id: 'Activity.<init>', classType: 'Landroid/app/Activity;', name: '<init>', protoIdx: 1 },
    { id: 'Activity.onCreate', classType: 'Landroid/app/Activity;', name: 'onCreate', protoIdx: 3 },
    { id: 'Activity.setContentView', classType: 'Landroid/app/Activity;', name: 'setContentView', protoIdx: 4 },
    { id: 'WebSettings.setDomStorageEnabled', classType: 'Landroid/webkit/WebSettings;', name: 'setDomStorageEnabled', protoIdx: 7 },
    { id: 'WebSettings.setJavaScriptEnabled', classType: 'Landroid/webkit/WebSettings;', name: 'setJavaScriptEnabled', protoIdx: 7 },
    { id: 'WebView.<init>', classType: 'Landroid/webkit/WebView;', name: '<init>', protoIdx: 2 },
    { id: 'WebView.getSettings', classType: 'Landroid/webkit/WebView;', name: 'getSettings', protoIdx: 0 },
    { id: 'WebView.loadUrl', classType: 'Landroid/webkit/WebView;', name: 'loadUrl', protoIdx: 6 },
    { id: 'WebView.setWebViewClient', classType: 'Landroid/webkit/WebView;', name: 'setWebViewClient', protoIdx: 5 },
    { id: 'WebViewClient.<init>', classType: 'Landroid/webkit/WebViewClient;', name: '<init>', protoIdx: 1 },
    { id: 'MainActivity.<init>', classType: 'Lcom/protogrow/completedtasks/MainActivity;', name: '<init>', protoIdx: 1 },
    { id: 'MainActivity.onCreate', classType: 'Lcom/protogrow/completedtasks/MainActivity;', name: 'onCreate', protoIdx: 3 }
  ].sort((a, b) => {
    const cDiff = tIdx(a.classType) - tIdx(b.classType);
    if (cDiff !== 0) return cDiff;
    const nDiff = sIdx(a.name) - sIdx(b.name);
    if (nDiff !== 0) return nDiff;
    return a.protoIdx - b.protoIdx;
  });

  const mIdx = (id: string): number => {
    const i = methods.findIndex((m) => m.id === id);
    if (i === -1) throw new Error(`DEX method missing: ${id}`);
    return i;
  };

  // Build Code Item 1: MainActivity.<init>()V
  // registers_size = 1 (p0 = v0), ins_size = 1, outs_size = 1, tries_size = 0
  // invoke-direct {v0}, Activity.<init>()V  -> 70 10 <method_idx_16> 00 00
  // return-void                             -> 0e 00
  const codeInitInsns = Buffer.alloc(8);
  codeInitInsns.writeUInt16LE(0x1070, 0);
  codeInitInsns.writeUInt16LE(mIdx('Activity.<init>'), 2);
  codeInitInsns.writeUInt16LE(0x0000, 4);
  codeInitInsns.writeUInt16LE(0x000e, 6);

  const codeInitItem = Buffer.alloc(16 + codeInitInsns.length);
  codeInitItem.writeUInt16LE(1, 0); // registers_size
  codeInitItem.writeUInt16LE(1, 2); // ins_size
  codeInitItem.writeUInt16LE(1, 4); // outs_size
  codeInitItem.writeUInt16LE(0, 6); // tries_size
  codeInitItem.writeUInt32LE(0, 8); // debug_info_off
  codeInitItem.writeUInt32LE(codeInitInsns.length / 2, 12); // insns_size in 16-bit code units
  codeInitInsns.copy(codeInitItem, 16);

  // Build Code Item 2: MainActivity.onCreate(Bundle)V
  // registers_size = 5 (v0, v1, v2, p0=v3, p1=v4), ins_size = 2, outs_size = 2, tries_size = 0
  const insnsWords: number[] = [
    // 1. invoke-super {v3, v4}, Activity.onCreate(Bundle)V
    0x206f,
    mIdx('Activity.onCreate'),
    0x0043,
    // 2. new-instance v0, Landroid/webkit/WebView;
    0x0022,
    tIdx('Landroid/webkit/WebView;'),
    // 3. invoke-direct {v0, v3}, WebView.<init>(Context)V
    0x2070,
    mIdx('WebView.<init>'),
    0x0030,
    // 4. invoke-virtual {v0}, WebView.getSettings()WebSettings
    0x106e,
    mIdx('WebView.getSettings'),
    0x0000,
    // 5. move-result-object v1
    0x010c,
    // 6. const/4 v2, 0x1
    0x1212,
    // 7. invoke-virtual {v1, v2}, WebSettings.setJavaScriptEnabled(Z)V
    0x206e,
    mIdx('WebSettings.setJavaScriptEnabled'),
    0x0021,
    // 8. invoke-virtual {v1, v2}, WebSettings.setDomStorageEnabled(Z)V
    0x206e,
    mIdx('WebSettings.setDomStorageEnabled'),
    0x0021,
    // 9. new-instance v2, Landroid/webkit/WebViewClient;
    0x0222,
    tIdx('Landroid/webkit/WebViewClient;'),
    // 10. invoke-direct {v2}, WebViewClient.<init>()V
    0x1070,
    mIdx('WebViewClient.<init>'),
    0x0002,
    // 11. invoke-virtual {v0, v2}, WebView.setWebViewClient(WebViewClient)V
    0x206e,
    mIdx('WebView.setWebViewClient'),
    0x0020,
    // 12. const-string v2, "file:///android_asset/index.html"
    0x021a,
    sIdx('file:///android_asset/index.html'),
    // 13. invoke-virtual {v0, v2}, WebView.loadUrl(String)V
    0x206e,
    mIdx('WebView.loadUrl'),
    0x0020,
    // 14. invoke-virtual {v3, v0}, Activity.setContentView(View)V
    0x206e,
    mIdx('Activity.setContentView'),
    0x0003,
    // 15. return-void
    0x000e
  ];

  const codeOnCreateInsns = Buffer.alloc(insnsWords.length * 2);
  insnsWords.forEach((w, idx) => codeOnCreateInsns.writeUInt16LE(w, idx * 2));

  // Pad to 4-byte boundary if needed
  const onCreatePad = (4 - ((16 + codeOnCreateInsns.length) % 4)) % 4;
  const codeOnCreateItem = Buffer.alloc(16 + codeOnCreateInsns.length + onCreatePad);
  codeOnCreateItem.writeUInt16LE(5, 0); // registers_size = 5
  codeOnCreateItem.writeUInt16LE(2, 2); // ins_size = 2 (p0=v3, p1=v4)
  codeOnCreateItem.writeUInt16LE(2, 4); // outs_size = 2
  codeOnCreateItem.writeUInt16LE(0, 6); // tries_size = 0
  codeOnCreateItem.writeUInt32LE(0, 8); // debug_info_off = 0
  codeOnCreateItem.writeUInt32LE(insnsWords.length, 12); // insns_size in 16-bit units
  codeOnCreateInsns.copy(codeOnCreateItem, 16);

  // Layout fixed offsets in DEX file:
  // Header: 112 bytes (0x00 .. 0x70)
  const headerOff = 0;
  const stringIdsOff = 112;
  const stringIdsSize = strings.length * 4;
  const typeIdsOff = stringIdsOff + stringIdsSize;
  const typeIdsSize = typeDescriptors.length * 4;
  const protoIdsOff = typeIdsOff + typeIdsSize;
  const protoIdsSize = protos.length * 12;
  const methodIdsOff = protoIdsOff + protoIdsSize;
  const methodIdsSize = methods.length * 8;
  const classDefsOff = methodIdsOff + methodIdsSize;
  const classDefsSize = 32; // 1 class_def_item

  const dataSectionStart = classDefsOff + classDefsSize;
  let cursor = dataSectionStart;

  // Data Section Item 1: type_list for protos with parameters (protos[2..7])
  const typeListOffsets: number[] = [];
  const typeListBuffers: Buffer[] = [];
  for (let i = 0; i < protos.length; i++) {
    if (protos[i].params.length === 0) {
      typeListOffsets.push(0);
    } else {
      typeListOffsets.push(cursor);
      // size (uint32 = 1) + type_idx (uint16) + 2 bytes padding = 8 bytes (4-byte aligned)
      const tlBuf = Buffer.alloc(8, 0);
      tlBuf.writeUInt32LE(1, 0);
      tlBuf.writeUInt16LE(tIdx(protos[i].params[0]), 4);
      typeListBuffers.push(tlBuf);
      cursor += tlBuf.length;
    }
  }

  // Data Section Item 2: code_item 1 & code_item 2 (4-byte aligned)
  const codeInitOff = cursor;
  cursor += codeInitItem.length;
  const codeOnCreateOff = cursor;
  cursor += codeOnCreateItem.length;

  // Data Section Item 3: string_data_item list
  const stringDataOffsets: number[] = [];
  const stringDataBuffers: Buffer[] = [];
  for (const s of strings) {
    stringDataOffsets.push(cursor);
    const utf8Bytes = Buffer.from(s, 'utf8');
    const lenPrefix = writeUleb128([s.length]);
    const sBuf = Buffer.concat([lenPrefix, utf8Bytes, Buffer.from([0])]);
    stringDataBuffers.push(sBuf);
    cursor += sBuf.length;
  }

  // Data Section Item 4: class_data_item
  const classDataOff = cursor;
  const initMethodIdx = mIdx('MainActivity.<init>');
  const onCreateMethodIdx = mIdx('MainActivity.onCreate');
  const classDataBuf = writeUleb128([
    0, // static_fields_size
    0, // instance_fields_size
    1, // direct_methods_size (MainActivity.<init>)
    1, // virtual_methods_size (MainActivity.onCreate)
    // direct_method[0]:
    initMethodIdx,
    0x10001, // ACC_PUBLIC | ACC_CONSTRUCTOR
    codeInitOff,
    // virtual_method[0]:
    onCreateMethodIdx,
    0x0001, // ACC_PUBLIC
    codeOnCreateOff
  ]);
  cursor += classDataBuf.length;

  // Align cursor to 4 bytes before map_list
  const preMapPadLen = (4 - (cursor % 4)) % 4;
  const preMapPad = Buffer.alloc(preMapPadLen, 0);
  cursor += preMapPadLen;

  // Data Section Item 5: map_list (required by DEX verifier!)
  const mapOff = cursor;
  interface MapEntry {
    type: number;
    size: number;
    offset: number;
  }
  const mapEntries: MapEntry[] = [
    { type: 0x0000, size: 1, offset: headerOff }, // TYPE_HEADER_ITEM
    { type: 0x0001, size: strings.length, offset: stringIdsOff }, // TYPE_STRING_ID_ITEM
    { type: 0x0002, size: typeDescriptors.length, offset: typeIdsOff }, // TYPE_TYPE_ID_ITEM
    { type: 0x0003, size: protos.length, offset: protoIdsOff }, // TYPE_PROTO_ID_ITEM
    { type: 0x0005, size: methods.length, offset: methodIdsOff }, // TYPE_METHOD_ID_ITEM
    { type: 0x0006, size: 1, offset: classDefsOff }, // TYPE_CLASS_DEF_ITEM
    { type: 0x1001, size: typeListBuffers.length, offset: typeListOffsets.find((o) => o > 0) || 0 }, // TYPE_TYPE_LIST
    { type: 0x2001, size: 2, offset: codeInitOff }, // TYPE_CODE_ITEM
    { type: 0x2002, size: strings.length, offset: stringDataOffsets[0] }, // TYPE_STRING_DATA_ITEM
    { type: 0x2000, size: 1, offset: classDataOff }, // TYPE_CLASS_DATA_ITEM
    { type: 0x1000, size: 1, offset: mapOff } // TYPE_MAP_LIST
  ];

  const mapListBuf = Buffer.alloc(4 + mapEntries.length * 12, 0);
  mapListBuf.writeUInt32LE(mapEntries.length, 0);
  mapEntries.forEach((entry, idx) => {
    const off = 4 + idx * 12;
    mapListBuf.writeUInt16LE(entry.type, off);
    mapListBuf.writeUInt16LE(0, off + 2);
    mapListBuf.writeUInt32LE(entry.size, off + 4);
    mapListBuf.writeUInt32LE(entry.offset, off + 8);
  });
  cursor += mapListBuf.length;

  const totalFileSize = cursor;
  const dataSize = totalFileSize - dataSectionStart;

  // Assemble fixed tables
  const stringIdsBuf = Buffer.alloc(stringIdsSize);
  stringDataOffsets.forEach((off, idx) => stringIdsBuf.writeUInt32LE(off, idx * 4));

  const typeIdsBuf = Buffer.alloc(typeIdsSize);
  typeDescriptors.forEach((td, idx) => typeIdsBuf.writeUInt32LE(sIdx(td), idx * 4));

  const protoIdsBuf = Buffer.alloc(protoIdsSize);
  protos.forEach((p, idx) => {
    const off = idx * 12;
    protoIdsBuf.writeUInt32LE(sIdx(p.shorty), off);
    protoIdsBuf.writeUInt32LE(tIdx(p.returnType), off + 4);
    protoIdsBuf.writeUInt32LE(typeListOffsets[idx], off + 8);
  });

  const methodIdsBuf = Buffer.alloc(methodIdsSize);
  methods.forEach((m, idx) => {
    const off = idx * 8;
    methodIdsBuf.writeUInt16LE(tIdx(m.classType), off);
    methodIdsBuf.writeUInt16LE(m.protoIdx, off + 2);
    methodIdsBuf.writeUInt32LE(sIdx(m.name), off + 4);
  });

  const classDefsBuf = Buffer.alloc(classDefsSize, 0);
  classDefsBuf.writeUInt32LE(tIdx('Lcom/protogrow/completedtasks/MainActivity;'), 0); // class_idx
  classDefsBuf.writeUInt32LE(0x0001, 4); // access_flags = ACC_PUBLIC
  classDefsBuf.writeUInt32LE(tIdx('Landroid/app/Activity;'), 8); // superclass_idx
  classDefsBuf.writeUInt32LE(0, 12); // interfaces_off
  classDefsBuf.writeUInt32LE(0xffffffff, 16); // source_file_idx = NO_INDEX
  classDefsBuf.writeUInt32LE(0, 20); // annotations_off
  classDefsBuf.writeUInt32LE(classDataOff, 24); // class_data_off
  classDefsBuf.writeUInt32LE(0, 28); // static_values_off

  const headerBuf = Buffer.alloc(112, 0);
  headerBuf.write('dex\n035\0', 0, 'ascii');
  headerBuf.writeUInt32LE(totalFileSize, 32);
  headerBuf.writeUInt32LE(112, 36);
  headerBuf.writeUInt32LE(0x12345678, 40); // ENDIAN_CONSTANT
  headerBuf.writeUInt32LE(0, 44); // link_size
  headerBuf.writeUInt32LE(0, 48); // link_off
  headerBuf.writeUInt32LE(mapOff, 52); // map_off
  headerBuf.writeUInt32LE(strings.length, 56); // string_ids_size
  headerBuf.writeUInt32LE(stringIdsOff, 60); // string_ids_off
  headerBuf.writeUInt32LE(typeDescriptors.length, 64); // type_ids_size
  headerBuf.writeUInt32LE(typeIdsOff, 68); // type_ids_off
  headerBuf.writeUInt32LE(protos.length, 72); // proto_ids_size
  headerBuf.writeUInt32LE(protoIdsOff, 76); // proto_ids_off
  headerBuf.writeUInt32LE(0, 80); // field_ids_size
  headerBuf.writeUInt32LE(0, 84); // field_ids_off
  headerBuf.writeUInt32LE(methods.length, 88); // method_ids_size
  headerBuf.writeUInt32LE(methodIdsOff, 92); // method_ids_off
  headerBuf.writeUInt32LE(1, 96); // class_defs_size
  headerBuf.writeUInt32LE(classDefsOff, 100); // class_defs_off
  headerBuf.writeUInt32LE(dataSize, 104); // data_size
  headerBuf.writeUInt32LE(dataSectionStart, 108); // data_off

  const fullDex = Buffer.concat([
    headerBuf,
    stringIdsBuf,
    typeIdsBuf,
    protoIdsBuf,
    methodIdsBuf,
    classDefsBuf,
    ...typeListBuffers,
    codeInitItem,
    codeOnCreateItem,
    ...stringDataBuffers,
    classDataBuf,
    preMapPad,
    mapListBuf
  ]);

  // Compute SHA-1 signature over bytes 32..end
  const sha1 = crypto.createHash('sha1').update(fullDex.subarray(32)).digest();
  sha1.copy(fullDex, 12);

  // Compute Adler-32 checksum over bytes 12..end
  let a = 1;
  let b = 0;
  for (let i = 12; i < fullDex.length; i++) {
    a = (a + fullDex[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  fullDex.writeUInt32LE(adler, 8);

  return fullDex;
}

/**
 * ============================================================================
 * 3. BINARY RESOURCES.ARSC COMPILER
 * Produces a valid ResTable_header + empty ResStringPool_header so Android's
 * AssetManager2 accepts resources.arsc without errors.
 * ============================================================================
 */
export function compileMinimalResourcesArsc(
  packageName = 'com.protogrow.completedtasks'
): Buffer {
  // Total size = 12 (ResTable_header) + 28 (Global StringPool) + 344 (ResTable_package) = 384 bytes
  const buf = Buffer.alloc(384, 0);

  const writeEmptyStringPool = (offset: number) => {
    buf.writeUInt16LE(0x0001, offset); // RES_STRING_POOL_TYPE
    buf.writeUInt16LE(28, offset + 2); // headerSize = 28
    buf.writeUInt32LE(28, offset + 4); // size = 28
    buf.writeUInt32LE(0, offset + 8); // stringCount = 0
    buf.writeUInt32LE(0, offset + 12); // styleCount = 0
    buf.writeUInt32LE(0, offset + 16); // flags = 0 (UTF-16)
    buf.writeUInt32LE(28, offset + 20); // stringsStart = 28
    buf.writeUInt32LE(0, offset + 24); // stylesStart = 0
  };

  // 1. ResTable_header (12 bytes at offset 0)
  buf.writeUInt16LE(0x0002, 0); // RES_TABLE_TYPE
  buf.writeUInt16LE(12, 2); // headerSize = 12
  buf.writeUInt32LE(384, 4); // total size = 384
  buf.writeUInt32LE(1, 8); // packageCount = 1

  // 2. Global ResStringPool_header (28 bytes at offset 12)
  writeEmptyStringPool(12);

  // 3. ResTable_package (288-byte header + 2x28-byte string pools = 344 bytes at offset 40)
  const pkgOffset = 40;
  buf.writeUInt16LE(0x0200, pkgOffset); // RES_TABLE_PACKAGE_TYPE
  buf.writeUInt16LE(288, pkgOffset + 2); // headerSize = 288
  buf.writeUInt32LE(344, pkgOffset + 4); // size = 344
  buf.writeUInt32LE(0x7f, pkgOffset + 8); // id = 0x7f (user package)

  // Package name UTF-16LE (up to 127 chars in 256 bytes at pkgOffset + 12)
  buf.write(packageName, pkgOffset + 12, Math.min(packageName.length * 2, 254), 'utf16le');

  buf.writeUInt32LE(288, pkgOffset + 268); // typeStrings offset relative to pkgOffset
  buf.writeUInt32LE(0, pkgOffset + 272); // lastPublicType
  buf.writeUInt32LE(288 + 28, pkgOffset + 276); // keyStrings offset relative to pkgOffset
  buf.writeUInt32LE(0, pkgOffset + 280); // lastPublicKey
  buf.writeUInt32LE(0, pkgOffset + 284); // typeIdOffset

  // typeStrings empty pool at pkgOffset + 288 (offset 328)
  writeEmptyStringPool(pkgOffset + 288);
  // keyStrings empty pool at pkgOffset + 316 (offset 356)
  writeEmptyStringPool(pkgOffset + 316);

  return buf;
}

/**
 * ============================================================================
 * 4. ZIPALIGNED ZIP ARCHIVE BUILDER + APK SIGNATURE SCHEME V1 & V2 SIGNER
 * Builds a deterministic, 4-byte aligned ZIP archive and signs it with BOTH:
 * - V1 JAR Signature (META-INF/MANIFEST.MF, CERT.SF, CERT.RSA)
 * - V2 APK Signing Block (APK Sig Block 42, ID 0x7109871a) required by Android 7..15
 * ============================================================================
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function generateSigningCredentials(): {
  privateKeyPem: string;
  certDer: Buffer;
  signPkcs7Der: (sfBuf: Buffer) => Buffer | null;
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-apk-v2-'));
  const keyPath = path.join(tmpDir, 'key.pem');
  const certPemPath = path.join(tmpDir, 'cert.pem');
  const certDerPath = path.join(tmpDir, 'cert.der');

  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      keyPath,
      '-out',
      certPemPath,
      '-days',
      '10000',
      '-nodes',
      '-subj',
      '/CN=PTG Completed Tasks Lite/O=PRO-TO-GROW/C=IN'
    ],
    { stdio: 'ignore' }
  );

  execFileSync(
    'openssl',
    ['x509', '-in', certPemPath, '-outform', 'DER', '-out', certDerPath],
    { stdio: 'ignore' }
  );

  const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  const certDer = fs.readFileSync(certDerPath);

  const signPkcs7Der = (sfBuf: Buffer): Buffer | null => {
    try {
      const sfPath = path.join(tmpDir, 'CERT.SF');
      const rsaPath = path.join(tmpDir, 'CERT.RSA');
      fs.writeFileSync(sfPath, sfBuf);
      execFileSync(
        'openssl',
        [
          'cms',
          '-sign',
          '-binary',
          '-noattr',
          '-md',
          'sha256',
          '-in',
          sfPath,
          '-signer',
          certPemPath,
          '-inkey',
          keyPath,
          '-outform',
          'DER',
          '-out',
          rsaPath
        ],
        { stdio: 'ignore' }
      );
      return fs.readFileSync(rsaPath);
    } catch {
      return null;
    }
  };

  // Clean up temp directory on next tick after signing finishes
  setTimeout(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }, 5000);

  return { privateKeyPem, certDer, signPkcs7Der };
}

function lengthPrefixedBlock(buf: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

/**
 * Computes the APK Signature Scheme v2 top-level SHA-256 digest over the 3 ZIP sections:
 * 1) beforeCentralDir (0 .. centralDirOffset)
 * 2) centralDir
 * 3) eocd (with centralDirOffset updated to point to the start of the APK Signing Block)
 */
function computeApkV2ContentDigest(sections: Buffer[]): Buffer {
  const CHUNK_SIZE = 1024 * 1024; // 1 MB
  const chunkDigests: Buffer[] = [];
  let totalChunks = 0;

  for (const section of sections) {
    let offset = 0;
    while (offset < section.length) {
      const slice = section.subarray(offset, Math.min(offset + CHUNK_SIZE, section.length));
      const chunkPrefix = Buffer.alloc(5);
      chunkPrefix.writeUInt8(0xa5, 0);
      chunkPrefix.writeUInt32LE(slice.length, 1);
      const digest = crypto.createHash('sha256').update(chunkPrefix).update(slice).digest();
      chunkDigests.push(digest);
      totalChunks++;
      offset += slice.length;
    }
  }

  const topPrefix = Buffer.alloc(5);
  topPrefix.writeUInt8(0x5a, 0);
  topPrefix.writeUInt32LE(totalChunks, 1);
  return crypto
    .createHash('sha256')
    .update(topPrefix)
    .update(Buffer.concat(chunkDigests))
    .digest();
}

function buildApkSigningBlockV2(
  beforeCentralDir: Buffer,
  centralDir: Buffer,
  eocdTemplate: Buffer,
  privateKeyPem: string,
  certDer: Buffer
): { signingBlock: Buffer; updatedEocd: Buffer } {
  const SIGNATURE_ALGORITHM_RSA_PKCS1_V1_5_WITH_SHA256 = 0x0103;
  const APK_SIGNATURE_SCHEME_V2_BLOCK_ID = 0x7109871a;

  const publicKeyDer = crypto
    .createPublicKey(privateKeyPem)
    .export({ type: 'spki', format: 'der' }) as Buffer;

  // Build a dummy digest first to calculate the exact size of the APK Signing Block
  const buildBlockWithDigest = (digestBytes: Buffer): Buffer => {
    // digest entry: uint32 algorithmId + length-prefixed digest
    const algBuf = Buffer.alloc(4);
    algBuf.writeUInt32LE(SIGNATURE_ALGORITHM_RSA_PKCS1_V1_5_WITH_SHA256, 0);
    const singleDigestEntry = lengthPrefixedBlock(
      Buffer.concat([algBuf, lengthPrefixedBlock(digestBytes)])
    );
    const digestsList = lengthPrefixedBlock(singleDigestEntry);

    // certificates list: length-prefixed sequence of length-prefixed X.509 certificates
    const certsList = lengthPrefixedBlock(lengthPrefixedBlock(certDer));

    // additional attributes: empty length-prefixed sequence
    const additionalAttrs = Buffer.alloc(4, 0);

    // signedData (without outer length prefix)
    const signedDataRaw = Buffer.concat([
      digestsList,
      certsList,
      additionalAttrs,
      Buffer.alloc(4, 0) // Pad/alignment or v2 format: v2 signedData has 3 fields: digests, certificates, additionalAttributes
    ]).subarray(0, digestsList.length + certsList.length + additionalAttrs.length);

    // Sign signedDataRaw using RSA-SHA256
    const signatureBytes = crypto.sign('sha256', signedDataRaw, privateKeyPem);
    const singleSignatureEntry = lengthPrefixedBlock(
      Buffer.concat([algBuf, lengthPrefixedBlock(signatureBytes)])
    );
    const signaturesList = lengthPrefixedBlock(singleSignatureEntry);

    // signer: length-prefixed (length-prefixed signedData + signaturesList + length-prefixed publicKey)
    const signerBlock = lengthPrefixedBlock(
      Buffer.concat([
        lengthPrefixedBlock(signedDataRaw),
        signaturesList,
        lengthPrefixedBlock(publicKeyDer)
      ])
    );

    // v2 block value: length-prefixed sequence of signers
    const v2BlockValue = lengthPrefixedBlock(signerBlock);

    // ID-value pair: uint64 length + uint32 ID (0x7109871a) + v2BlockValue
    // Pad v2BlockValue or add padding pair so total signing block is a multiple of 4096 or 8 bytes
    const pairPayloadLen = 4 + v2BlockValue.length;
    const pairBuf = Buffer.alloc(8 + pairPayloadLen);
    pairBuf.writeBigUInt64LE(BigInt(pairPayloadLen), 0);
    pairBuf.writeUInt32LE(APK_SIGNATURE_SCHEME_V2_BLOCK_ID, 8);
    v2BlockValue.copy(pairBuf, 12);

    // Total block size (excluding first 8 bytes) = pairBuf.length + 8 (second sizeOfBlock) + 16 (magic)
    const sizeOfBlock = BigInt(pairBuf.length + 24);
    const totalBuf = Buffer.alloc(8 + pairBuf.length + 24);
    totalBuf.writeBigUInt64LE(sizeOfBlock, 0);
    pairBuf.copy(totalBuf, 8);
    totalBuf.writeBigUInt64LE(sizeOfBlock, 8 + pairBuf.length);
    totalBuf.write('APK Sig Block 42', 16 + pairBuf.length, 'ascii');
    return totalBuf;
  };

  // Compute V2 content digest where EOCD centralDirOffset == apkSigningBlockOffset (beforeCentralDir.length)
  // per AOSP ApkSigningBlockUtils.verifyIntegrity: ZipUtils.setZipEocdCentralDirectoryOffset(eocdBuf, apkSigningBlockOffset)
  const eocdForDigest = Buffer.from(eocdTemplate);
  eocdForDigest.writeUInt32LE(beforeCentralDir.length, 16);
  const realDigest = computeApkV2ContentDigest([beforeCentralDir, centralDir, eocdForDigest]);
  const signingBlock = buildBlockWithDigest(realDigest);

  const newCentralDirOffset = beforeCentralDir.length + signingBlock.length;
  const updatedEocd = Buffer.from(eocdTemplate);
  updatedEocd.writeUInt32LE(newCentralDirOffset, 16);

  return { signingBlock, updatedEocd };
}

export function buildInstallableSignedApkBuffer(options: {
  agencyName: string;
  htmlContent: string;
  snapshotJson: string;
}): Buffer {
  const packageName = 'com.protogrow.completedtasks';
  const appName = 'PTG Tasks & Views';

  const manifestXml = compileBinaryAndroidManifest(packageName, appName);
  const classesDex = compileMainActivityDex();
  const resourcesArsc = compileMinimalResourcesArsc(packageName);
  const indexHtml = Buffer.from(options.htmlContent, 'utf8');
  const snapshotBuf = Buffer.from(options.snapshotJson, 'utf8');

  const payloadFiles: Array<{ name: string; data: Buffer }> = [
    { name: 'AndroidManifest.xml', data: manifestXml },
    { name: 'classes.dex', data: classesDex },
    { name: 'resources.arsc', data: resourcesArsc },
    { name: 'assets/index.html', data: indexHtml },
    { name: 'assets/snapshot.json', data: snapshotBuf }
  ];

  // Build V1 JAR Signature files (META-INF/MANIFEST.MF, CERT.SF, CERT.RSA)
  const mainHeaderChunk = 'Manifest-Version: 1.0\r\nCreated-By: 1.0 (Android)\r\n\r\n';
  const entryChunks: Array<{ name: string; chunk: string }> = [];

  for (const file of payloadFiles) {
    const sha256B64 = crypto.createHash('sha256').update(file.data).digest('base64');
    const chunk = `Name: ${file.name}\r\nSHA-256-Digest: ${sha256B64}\r\n\r\n`;
    entryChunks.push({ name: file.name, chunk });
  }

  const manifestMf = Buffer.from(
    mainHeaderChunk + entryChunks.map((e) => e.chunk).join(''),
    'utf8'
  );
  const manifestMfDigest = crypto.createHash('sha256').update(manifestMf).digest('base64');
  const mainAttributesDigest = crypto
    .createHash('sha256')
    .update(Buffer.from(mainHeaderChunk, 'utf8'))
    .digest('base64');

  const sfLines: string[] = [
    'Signature-Version: 1.0',
    'Created-By: 1.0 (Android)',
    `SHA-256-Digest-Manifest: ${manifestMfDigest}`,
    `SHA-256-Digest-Manifest-Main-Attributes: ${mainAttributesDigest}`,
    'X-Android-APK-Signed: 2',
    ''
  ];

  for (const entry of entryChunks) {
    const sectionDigest = crypto
      .createHash('sha256')
      .update(Buffer.from(entry.chunk, 'utf8'))
      .digest('base64');
    sfLines.push(`Name: ${entry.name}`);
    sfLines.push(`SHA-256-Digest: ${sectionDigest}`);
    sfLines.push('');
  }

  const certSf = Buffer.from(sfLines.join('\r\n') + '\r\n', 'utf8');
  const { privateKeyPem, certDer, signPkcs7Der } = generateSigningCredentials();
  const certRsa = signPkcs7Der(certSf);

  const allZipFiles: Array<{ name: string; data: Buffer }> = [
    ...payloadFiles,
    { name: 'META-INF/MANIFEST.MF', data: manifestMf },
    { name: 'META-INF/CERT.SF', data: certSf },
    ...(certRsa ? [{ name: 'META-INF/CERT.RSA', data: certRsa }] : [])
  ];

  // Construct deterministic, 4-byte aligned STORED ZIP entries
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of allZipFiles) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = entry.data;
    const entryCrc = crc32(dataBuf);

    // Compute extra field padding so file data starts at a 4-byte aligned offset (zipalign)
    const unalignedDataStart = localOffset + 30 + nameBuf.length;
    const alignPad = (4 - (unalignedDataStart % 4)) % 4;
    const extraBuf = Buffer.alloc(alignPad, 0);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(0, 8); // Compression method = 0 (STORED)
    localHeader.writeUInt16LE(0x0000, 10); // Last mod file time
    localHeader.writeUInt16LE(0x0021, 12); // Last mod file date
    localHeader.writeUInt32LE(entryCrc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18); // Compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(extraBuf.length, 28);

    const fullLocalEntry = Buffer.concat([localHeader, nameBuf, extraBuf, dataBuf]);
    localParts.push(fullLocalEntry);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory file header signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract
    centralHeader.writeUInt16LE(0, 8); // General purpose bit flag
    centralHeader.writeUInt16LE(0, 10); // Compression method = 0 (STORED)
    centralHeader.writeUInt16LE(0x0000, 12); // Last mod time
    centralHeader.writeUInt16LE(0x0021, 14); // Last mod date
    centralHeader.writeUInt32LE(entryCrc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra field length in central directory = 0
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(localOffset, 42); // Relative offset of local header

    centralParts.push(Buffer.concat([centralHeader, nameBuf]));
    localOffset += fullLocalEntry.length;
  }

  const beforeCentralDir = Buffer.concat(localParts);
  const centralDir = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central dir signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(allZipFiles.length, 8); // Total entries on disk
  eocd.writeUInt16LE(allZipFiles.length, 10); // Total entries
  eocd.writeUInt32LE(centralDir.length, 12); // Size of central directory
  eocd.writeUInt32LE(beforeCentralDir.length, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  // Sign with APK Signature Scheme v2 (`APK Sig Block 42`) + V1
  const { signingBlock, updatedEocd } = buildApkSigningBlockV2(
    beforeCentralDir,
    centralDir,
    eocd,
    privateKeyPem,
    certDer
  );

  return Buffer.concat([beforeCentralDir, signingBlock, centralDir, updatedEocd]);
}

// Run from the root of the history_exhibition repository:
//   node scripts/check-glb-assets.mjs
// Checks actual GLB bytes (not a Git LFS pointer) and local texture/buffer references.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = path.join(repo, 'public', 'models');
const required = ['Map.glb', 'NPC_A.glb', 'NPC_B.glb', 'NPC_C.glb', 'NPC_J.glb', 'NPC_U.glb'];
let failures = 0;

function readExactly(fd, size, offset) {
  const bytes = Buffer.alloc(size);
  let read = 0;
  while (read < size) {
    const step = fs.readSync(fd, bytes, read, size - read, offset + read);
    if (!step) throw new Error('예상보다 짧은 파일');
    read += step;
  }
  return bytes;
}

for (const name of required) {
  const filename = path.join(modelsDir, name);
  try {
    if (!fs.existsSync(filename)) throw new Error('파일 없음');
    const { size } = fs.statSync(filename);
    if (size < 20) throw new Error('정상적인 GLB 파일이 되기에는 너무 작음');
    const fd = fs.openSync(filename, 'r');
    let info;
    try {
      const header = readExactly(fd, 20, 0);
      if (header.toString('ascii', 0, 4) !== 'glTF') {
        const first = readExactly(fd, Math.min(140, size), 0).toString('utf8');
        if (first.startsWith('version https://git-lfs.github.com/spec/v1')) {
          throw new Error('실제 GLB가 아니라 Git LFS 포인터 파일입니다. git lfs pull이 필요합니다.');
        }
        throw new Error('GLB 헤더(glTF)가 없습니다. 올바른 모델 파일인지 확인하세요.');
      }
      const version = header.readUInt32LE(4);
      const declaredSize = header.readUInt32LE(8);
      const jsonLength = header.readUInt32LE(12);
      const jsonType = header.toString('ascii', 16, 20);
      if (version !== 2) throw new Error('GLB 버전 2가 아닙니다.');
      if (declaredSize !== size) throw new Error(`GLB 내부 크기 ${declaredSize}와 파일 크기 ${size} 불일치`);
      if (jsonType !== 'JSON') throw new Error('첫 번째 청크가 JSON이 아닙니다.');
      if (jsonLength <= 0 || jsonLength > 100 * 1024 * 1024 || jsonLength > size - 20) {
        throw new Error('GLB JSON 청크 길이가 비정상입니다.');
      }
      const gltf = JSON.parse(readExactly(fd, jsonLength, 20).toString('utf8'));
      const refs = [ ...(gltf.images || []), ...(gltf.buffers || []) ];
      const externals = refs.map(item => item.uri).filter(uri => uri && !uri.startsWith('data:'));
      for (const uri of externals) {
        if (/^[a-z][\w+.-]*:/i.test(uri) || uri.startsWith('/')) {
          throw new Error(`외부 URL/절대 경로를 참조합니다: ${uri}`);
        }
        const abs = path.resolve(modelsDir, decodeURIComponent(uri.split('?')[0].split('#')[0]));
        if (!abs.startsWith(modelsDir + path.sep) || !fs.existsSync(abs)) {
          throw new Error(`외부 텍스처/버퍼 누락 또는 잘못된 경로: ${uri}`);
        }
      }
      info = `GLB v2 / ${(size / 1048576).toFixed(1)} MB / 외부 리소스 ${externals.length}개`;
    } finally {
      fs.closeSync(fd);
    }
    console.log(`✅ ${name}: ${info}`);
  } catch(error) {
    failures += 1;
    console.error(`❌ ${name}: ${error.message}`);
  }
}
console.log('참고: 기존 퀘스트 플레이어는 MapQuestIntegration.js의 3D 도형이며 플레이어 GLB를 불러오지 않습니다.');
if (failures) {
  console.error(`검사 실패: ${failures}개 에셋 오류. 업로드/실행 전에 해결하세요.`);
  process.exitCode = 1;
} else {
  console.log('모든 필수 GLB 검사 통과. 새 Clone 환경에서 한 번 더 실행 테스트하세요.');
}

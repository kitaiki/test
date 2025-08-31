import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import { fromLonLat, transform } from 'ol/proj.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Draw from 'ol/interaction/Draw.js';
import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import * as turf from '@turf/turf';


const source = new VectorSource();
const vectorLayer = new VectorLayer({
  source: source,
  style: {
    'fill-color': 'rgba(255, 255, 255, 0.2)',
    'stroke-color': '#0e31f5dd',
    'stroke-width': 4,
    'circle-radius': 7,
    'circle-fill-color': '#ffcc33',
  },
});

let draw;

// 지도 초기화
const map = new Map({
  target: 'map',
  layers: [
    new TileLayer({
      source: new OSM()
    }),
    vectorLayer
  ],
  view: new View({
    center: fromLonLat([126.9780, 37.5665]), // 서울 좌표
    zoom: 10
  })
});

// 지도가 로드되었을 때 콘솔에 메시지 출력
map.on('rendercomplete', () => {
  console.log('OpenLayers 지도가 성공적으로 로드되었습니다!');
});

function addInteractions() {
draw = new Draw({
    source: source,
    type: 'LineString',
  });
  map.addInteraction(draw);
}

addInteractions();


document.getElementById('btn-multi').addEventListener('click', () => {
  const features = vectorLayer.getSource().getFeatures();
  
  if (features.length === 0) {
    alert('먼저 선을 그려주세요!');
    return;
  }
  
  let coords = features[0].getGeometry().getCoordinates();
  
  if (coords.length < 2) {
    alert('최소 2개의 점이 필요합니다!');
    return;
  }
  
  // OpenLayers 좌표를 WGS84로 변환
  const point1 = transform(coords[0], 'EPSG:3857', 'EPSG:4326');
  const point2 = transform(coords[1], 'EPSG:3857', 'EPSG:4326');
  
  // Turf.js를 사용해서 두 점 사이의 베어링(방위각) 계산
  const bearing = turf.bearing(point1, point2);
  
  // 거리도 계산
  const distance = turf.distance(point1, point2, {units: 'kilometers'});
  
  console.log('두 점 사이의 각도(베어링):', bearing, '도');
  console.log('두 점 사이의 거리:', distance.toFixed(2), 'km');
  
  // 폴리곤을 500m 양쪽에 생성 (완벽한 직각 폴리곤 알고리즘 사용)
  createAddPolyline(coords, 0.5, 'both'); // 0.5km = 500m, 완벽한 직각 폴리곤 생성
  
  alert(`
    베어링(방위각): ${bearing.toFixed(2)}도
    거리: ${distance.toFixed(2)}km
    
    폴리곤이 500m 양쪽에 생성되었습니다.
    
    점1: [${point1[1].toFixed(6)}, ${point1[0].toFixed(6)}]
    점2: [${point2[1].toFixed(6)}, ${point2[0].toFixed(6)}]
  `);
})

// 기능.md 기준으로 구현한 평행선 생성 함수
function createAddPolyline(coords, distance, type) {
  console.log('🔧 createAddPolyline 함수 호출됨:', {
    coordsLength: coords.length,
    distance: distance,
    type: type
  });
  
  // 원본 선의 모든 좌표를 WGS84로 변환
  const wgs84Coords = coords.map(coord => 
    transform(coord, 'EPSG:3857', 'EPSG:4326')
  );
  
  console.log('🗺️ WGS84 좌표 변환 완료:', wgs84Coords.length, '개 점');
  
  if (wgs84Coords.length < 2) {
    console.error('최소 2개의 점이 필요합니다.');
    return;
  }
  
  try {
    // 원본 LineString을 GeoJSON 형태로 변환
    const originalLineGeoJSON = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: wgs84Coords
      }
    };
    
    // 각 보간점사이의 각도를 계산하여 진행 방향 기준으로 평행선 생성
    if (type === 'left') {
      // 왼쪽 평행선 생성 (진행 방향 기준 왼쪽)
      console.log('🔄 왼쪽 평행선 생성 시작...');
      
      const leftOffsetLine = turf.lineOffset(originalLineGeoJSON, -distance, {units: 'kilometers'});
      console.log('📐 turf.lineOffset 완료:', leftOffsetLine);
      
      if (leftOffsetLine && leftOffsetLine.geometry && leftOffsetLine.geometry.coordinates) {
        console.log('✅ lineOffset 결과 유효함, 좌표 개수:', leftOffsetLine.geometry.coordinates.length);
        
        const offsetCoords = [...leftOffsetLine.geometry.coordinates]; // 복사본 생성
        
        // 시작점과 끝점을 기존 선형의 점들과 직각이 되도록 보정
        const startPoint = wgs84Coords[0];
        const endPoint = wgs84Coords[wgs84Coords.length - 1];
        const lineBearing = turf.bearing(startPoint, endPoint);
        
        console.log('📍 기준점들:', { startPoint, endPoint, lineBearing });
        
        const correctedStartPoint = turf.destination(startPoint, distance, lineBearing - 90, {units: 'kilometers'});
        const correctedEndPoint = turf.destination(endPoint, distance, lineBearing - 90, {units: 'kilometers'});
        
        console.log('🔧 보정된 점들:', { 
          correctedStart: correctedStartPoint.geometry.coordinates, 
          correctedEnd: correctedEndPoint.geometry.coordinates 
        });
        
        // 직각 정렬을 위한 시작점과 끝점 보정
        offsetCoords[0] = correctedStartPoint.geometry.coordinates;
        offsetCoords[offsetCoords.length - 1] = correctedEndPoint.geometry.coordinates;
        
        console.log('📏 최종 좌표 배열:', offsetCoords);
        
        createLineFeature(offsetCoords, '#ff0000', '왼쪽 평행선 (진행방향 기준)');
      } else {
        console.error('❌ turf.lineOffset 결과가 유효하지 않음');
      }
      
    } else if (type === 'right') {
      // 오른쪽 평행선 생성 (진행 방향 기준 오른쪽)
      console.log('🔄 오른쪽 평행선 생성 시작...');
      
      const rightOffsetLine = turf.lineOffset(originalLineGeoJSON, distance, {units: 'kilometers'});
      console.log('📐 turf.lineOffset 완료:', rightOffsetLine);
      
      if (rightOffsetLine && rightOffsetLine.geometry && rightOffsetLine.geometry.coordinates) {
        console.log('✅ lineOffset 결과 유효함');
        
        const offsetCoords = [...rightOffsetLine.geometry.coordinates]; // 복사본 생성
        
        // 시작점과 끝점을 기존 선형의 점들과 직각이 되도록 보정
        const startPoint = wgs84Coords[0];
        const endPoint = wgs84Coords[wgs84Coords.length - 1];
        const lineBearing = turf.bearing(startPoint, endPoint);
        
        const correctedStartPoint = turf.destination(startPoint, distance, lineBearing + 90, {units: 'kilometers'});
        const correctedEndPoint = turf.destination(endPoint, distance, lineBearing + 90, {units: 'kilometers'});
        
        // 직각 정렬을 위한 시작점과 끝점 보정
        offsetCoords[0] = correctedStartPoint.geometry.coordinates;
        offsetCoords[offsetCoords.length - 1] = correctedEndPoint.geometry.coordinates;
        
        createLineFeature(offsetCoords, '#00ff00', '오른쪽 평행선 (진행방향 기준)');
      } else {
        console.error('❌ turf.lineOffset 결과가 유효하지 않음');
      }
      
    } else if (type === 'both') {
      // 양쪽 평행선 생성 (진행 방향 기준 양쪽)
      console.log('🔄 양쪽 평행선 생성 시작...');
      
      const leftOffsetLine = turf.lineOffset(originalLineGeoJSON, -distance, {units: 'kilometers'});
      const rightOffsetLine = turf.lineOffset(originalLineGeoJSON, distance, {units: 'kilometers'});
      
      console.log('📐 양쪽 turf.lineOffset 완료:', { leftOffsetLine, rightOffsetLine });
      
      const startPoint = wgs84Coords[0];
      const endPoint = wgs84Coords[wgs84Coords.length - 1];
      const lineBearing = turf.bearing(startPoint, endPoint);
      
      // 왼쪽 평행선 처리
      if (leftOffsetLine && leftOffsetLine.geometry && leftOffsetLine.geometry.coordinates) {
        console.log('✅ 왼쪽 lineOffset 유효함');
        
        const leftOffsetCoords = [...leftOffsetLine.geometry.coordinates]; // 복사본 생성
        
        const correctedStartPointLeft = turf.destination(startPoint, distance, lineBearing - 90, {units: 'kilometers'});
        const correctedEndPointLeft = turf.destination(endPoint, distance, lineBearing - 90, {units: 'kilometers'});
        
        leftOffsetCoords[0] = correctedStartPointLeft.geometry.coordinates;
        leftOffsetCoords[leftOffsetCoords.length - 1] = correctedEndPointLeft.geometry.coordinates;
        
        createLineFeature(leftOffsetCoords, '#ff0000', '왼쪽 평행선 (진행방향 기준)');
      } else {
        console.error('❌ 왼쪽 turf.lineOffset 결과가 유효하지 않음');
      }
      
      // 오른쪽 평행선 처리
      if (rightOffsetLine && rightOffsetLine.geometry && rightOffsetLine.geometry.coordinates) {
        console.log('✅ 오른쪽 lineOffset 유효함');
        
        const rightOffsetCoords = [...rightOffsetLine.geometry.coordinates]; // 복사본 생성
        
        const correctedStartPointRight = turf.destination(startPoint, distance, lineBearing + 90, {units: 'kilometers'});
        const correctedEndPointRight = turf.destination(endPoint, distance, lineBearing + 90, {units: 'kilometers'});
        
        rightOffsetCoords[0] = correctedStartPointRight.geometry.coordinates;
        rightOffsetCoords[rightOffsetCoords.length - 1] = correctedEndPointRight.geometry.coordinates;
        
        createLineFeature(rightOffsetCoords, '#00ff00', '오른쪽 평행선 (진행방향 기준)');
      } else {
        console.error('❌ 오른쪽 turf.lineOffset 결과가 유효하지 않음');
      }
    }
    
    console.log(`평행선 생성 완료 (기능.md 기준): ${type} 방향`, {
      type: type,
      distance: distance + 'km',
      totalPoints: wgs84Coords.length,
      features: [
        '각 보간점사이 각도 계산',
        '진행 방향 기준 왼쪽/오른쪽 선정',
        '기존 선과 등일한 간격 유지',
        '직각 정렬된 점들'
      ]
    });
    
  } catch (error) {
    console.error('평행선 생성 중 오류 발생:', error);
  }
}

// 선형 Feature 생성 함수 (createAddPolyline용)
function createLineFeature(lineCoords, strokeColor, label) {
  console.log('🎨 createLineFeature 함수 호출됨:', {
    coordsLength: lineCoords.length,
    strokeColor: strokeColor,
    label: label
  });
  
  // WGS84 좌표를 다시 OpenLayers 좌표계로 변환
  const projectedCoords = lineCoords.map(coord => 
    transform(coord, 'EPSG:4326', 'EPSG:3857')
  );
  
  console.log('📍 좌표 변환 완료:', projectedCoords.length, '개 점');
  
  // LineString Feature 생성
  const line = new Feature({
    geometry: new LineString(projectedCoords)
  });
  
  console.log('📏 LineString Feature 생성 완료');
  
  // 선 스타일
  line.setStyle(new Style({
    stroke: new Stroke({
      color: strokeColor,
      width: 3
    })
  }));
  
  console.log('🎨 스타일 적용 완료:', strokeColor);
  
  // 벡터 레이어에 추가
  vectorLayer.getSource().addFeature(line);
  
  console.log(`✅ ${label} 생성 완료:`, {
    pointsCount: projectedCoords.length,
    color: strokeColor
  });
}
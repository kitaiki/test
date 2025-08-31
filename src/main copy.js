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
  createPerfectRectanglePolygon(coords, 0.5, 'both'); // 0.5km = 500m, 완벽한 직각 폴리곤 생성
  
  alert(`
    베어링(방위각): ${bearing.toFixed(2)}도
    거리: ${distance.toFixed(2)}km
    
    폴리곤이 500m 양쪽에 생성되었습니다.
    
    점1: [${point1[1].toFixed(6)}, ${point1[0].toFixed(6)}]
    점2: [${point2[1].toFixed(6)}, ${point2[0].toFixed(6)}]
  `);
})

function createParallelLineImproved(originalCoords, bearing, offsetDistanceKm, side = 'left') {
  // 원본 선의 모든 좌표를 WGS84로 변환
  const wgs84Coords = originalCoords.map(coord => 
    transform(coord, 'EPSG:3857', 'EPSG:4326')
  );
  
  if (wgs84Coords.length < 2) {
    console.error('최소 2개의 점이 필요합니다.');
    return;
  }
  
  // side 매개변수 유효성 검사
  if (!['left', 'right', 'both'].includes(side)) {
    console.error('side 매개변수는 "left", "right", "both" 중 하나여야 합니다.');
    return;
  }
  
  // 생성할 방향들 결정
  const sides = side === 'both' ? ['left', 'right'] : [side];
  
  try {
    // 원본 LineString을 GeoJSON 형태로 변환
    const originalLineGeoJSON = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: wgs84Coords
      }
    };
    
    sides.forEach(currentSide => {
      // Turf.js lineOffset을 사용해서 정확한 평행선 생성
      const distance = currentSide === 'left' ? offsetDistanceKm : -offsetDistanceKm;
      const offsetLine = turf.lineOffset(originalLineGeoJSON, distance, {units: 'kilometers'});
      
      if (offsetLine && offsetLine.geometry && offsetLine.geometry.coordinates) {
        // WGS84 좌표를 다시 OpenLayers 좌표계로 변환
        const projectedCoords = offsetLine.geometry.coordinates.map(coord => 
          transform(coord, 'EPSG:4326', 'EPSG:3857')
        );
        
        // 새로운 LineString Feature 생성
        const parallelLine = new Feature({
          geometry: new LineString(projectedCoords)
        });
        
        // 색상으로 구분 (왼쪽: 빨강, 오른쪽: 파랑)
        parallelLine.setStyle(new Style({
          stroke: new Stroke({
            color: currentSide === 'left' ? '#ff0000' : '#00ff00',
            width: 3
          })
        }));
        
        // 벡터 레이어에 추가
        vectorLayer.getSource().addFeature(parallelLine);
        
        console.log(`${currentSide} 개선된 평행선 생성 완료:`, {
          side: currentSide,
          offsetDistance: offsetDistanceKm + 'km',
          pointsCount: projectedCoords.length,
          method: 'Turf.js lineOffset 사용 - 일정한 거리 유지'
        });
      }
    });
    
  } catch (error) {
    console.error('평행선 생성 중 오류 발생:', error);
    console.log('기존 방식으로 대체 실행합니다.');
    // 오류 발생시 기존 방식으로 대체
    createParallelLine2(originalCoords, bearing, offsetDistanceKm, side);
  }
}

function createParallelLineImproved2(originalCoords, bearing, offsetDistanceKm, side = 'left') {
  // 원본 선의 모든 좌표를 WGS84로 변환
  const wgs84Coords = originalCoords.map(coord => 
    transform(coord, 'EPSG:3857', 'EPSG:4326')
  );
  
  if (wgs84Coords.length < 2) {
    console.error('최소 2개의 점이 필요합니다.');
    return;
  }
  
  // side 매개변수 유효성 검사
  if (!['left', 'right', 'both'].includes(side)) {
    console.error('side 매개변수는 "left", "right", "both" 중 하나여야 합니다.');
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
    
    if (side === 'left') {
      // 왼쪽: 원본 선 + 왼쪽 평행선으로 직각 폴리곤 (음수 = 왼쪽)
      const leftOffsetLine = turf.lineOffset(originalLineGeoJSON, -offsetDistanceKm, {units: 'kilometers'});
      
      if (leftOffsetLine && leftOffsetLine.geometry && leftOffsetLine.geometry.coordinates) {
        const originalCoords = wgs84Coords;
        const offsetCoords = leftOffsetLine.geometry.coordinates;
        
        
        // 간단한 직각 폴리곤: 원본선을 따라가다가 평행선을 역순으로 돌아오기
        const polygonCoords = [
          ...originalCoords,                    // 원본 선 (시작→끝)
          ...offsetCoords.slice().reverse(),    // 평행선 역순 (끝→시작)
          originalCoords[0]                     // 원본 선 시작점 (폴리곤 닫기)
        ];
        
        createPolygonFeature(polygonCoords, '#ff000080', '왼쪽 직각 폴리곤'); // 빨강 반투명
      }
      
    } else if (side === 'right') {
      // 오른쪽: 원본 선 + 오른쪽 평행선으로 직각 폴리곤 (양수 = 오른쪽)
      const rightOffsetLine = turf.lineOffset(originalLineGeoJSON, offsetDistanceKm, {units: 'kilometers'});
      
      if (rightOffsetLine && rightOffsetLine.geometry && rightOffsetLine.geometry.coordinates) {
        const originalCoords = wgs84Coords;
        const offsetCoords = rightOffsetLine.geometry.coordinates;
        
        
        // 간단한 직각 폴리곤: 원본선을 따라가다가 평행선을 역순으로 돌아오기
        const polygonCoords = [
          ...originalCoords,                     // 원본선 (시작→끝)
          ...offsetCoords.slice().reverse(),     // 평행선 역순 (끝→시작)
          originalCoords[0]                      // 원본선 시작점으로 닫기
        ];
        
        createPolygonFeature(polygonCoords, '#00ff0080', '오른쪽 직각 폴리곤'); // 초록 반투명
        
        console.log('Right polygon - 직각 연결 확인:', {
          원본시작점: originalCoords[0],
          원본끝점: originalCoords[originalCoords.length - 1],
          시작점수직: startRightPoint.geometry.coordinates,
          끝점수직: endRightPoint.geometry.coordinates,
          평행선시작: offsetCoords[0],
          평행선끝: offsetCoords[offsetCoords.length - 1]
        });
      }
      
    } else if (side === 'both') {
      // 양쪽: 왼쪽 평행선 + 오른쪽 평행선으로 직각 폴리곤
      const leftOffsetLine = turf.lineOffset(originalLineGeoJSON, -offsetDistanceKm, {units: 'kilometers'});
      const rightOffsetLine = turf.lineOffset(originalLineGeoJSON, offsetDistanceKm, {units: 'kilometers'});
      
      if (leftOffsetLine && rightOffsetLine && 
          leftOffsetLine.geometry && leftOffsetLine.geometry.coordinates &&
          rightOffsetLine.geometry && rightOffsetLine.geometry.coordinates) {
        
        const leftCoords = leftOffsetLine.geometry.coordinates;
        const rightCoords = rightOffsetLine.geometry.coordinates;
        
        
        // 간단한 직각 폴리곤: 왼쪽평행선 → 오른쪽평행선역순으로 연결
        const polygonCoords = [
          ...leftCoords,                        // 왼쪽 평행선 (시작→끝)
          ...rightCoords.slice().reverse(),     // 오른쪽 평행선 역순 (끝→시작)
          leftCoords[0]                         // 왼쪽 평행선 시작점 (폴리곤 닫기)
        ];
        
        createPolygonFeature(polygonCoords, '#0000ff80', '양쪽 직각 폴리곤'); // 파랑 반투명
      }
    }
    
    console.log(`폴리곤 생성 완료: ${side} 방향`, {
      side: side,
      offsetDistance: offsetDistanceKm + 'km',
      method: 'Turf.js lineOffset + Polygon 생성'
    });
    
  } catch (error) {
    console.error('폴리곤 생성 중 오류 발생:', error);
  }
}

// 정확한 평행선 생성 함수 (Turf.js lineOffset 사용)
function createPerfectRectanglePolyline(originalCoords, offsetDistanceKm, side = 'right') {
  // 원본 선의 모든 좌표를 WGS84로 변환
  const wgs84Coords = originalCoords.map(coord => 
    transform(coord, 'EPSG:3857', 'EPSG:4326')
  );
  
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
    
    if (side === 'right') {
      // 오른쪽 평행선 생성 (양수 = 오른쪽)
      const rightOffsetLine = turf.lineOffset(originalLineGeoJSON, offsetDistanceKm, {units: 'kilometers'});
      
      if (rightOffsetLine && rightOffsetLine.geometry && rightOffsetLine.geometry.coordinates) {
        createLineFeature(rightOffsetLine.geometry.coordinates, '#00ff00', '오른쪽 정확한 평행선');
      }
      
    } else if (side === 'left') {
      // 왼쪽 평행선 생성 (음수 = 왼쪽)
      const leftOffsetLine = turf.lineOffset(originalLineGeoJSON, -offsetDistanceKm, {units: 'kilometers'});
      
      if (leftOffsetLine && leftOffsetLine.geometry && leftOffsetLine.geometry.coordinates) {
        createLineFeature(leftOffsetLine.geometry.coordinates, '#ff0000', '왼쪽 정확한 평행선');
      }
      
    } else if (side === 'both') {
      // 양쪽 평행선 생성
      const leftOffsetLine = turf.lineOffset(originalLineGeoJSON, -offsetDistanceKm, {units: 'kilometers'});
      const rightOffsetLine = turf.lineOffset(originalLineGeoJSON, offsetDistanceKm, {units: 'kilometers'});
      
      if (leftOffsetLine && leftOffsetLine.geometry && leftOffsetLine.geometry.coordinates) {
        createLineFeature(leftOffsetLine.geometry.coordinates, '#ff0000', '왼쪽 정확한 평행선');
      }
      
      if (rightOffsetLine && rightOffsetLine.geometry && rightOffsetLine.geometry.coordinates) {
        createLineFeature(rightOffsetLine.geometry.coordinates, '#00ff00', '오른쪽 정확한 평행선');
      }
    }
    
    console.log(`정확한 평행선 생성 완료: ${side} 방향`, {
      side: side,
      offsetDistance: offsetDistanceKm + 'km',
      method: 'Turf.js lineOffset을 사용한 정확한 평행선 생성'
    });
    
  } catch (error) {
    console.error('평행선 생성 중 오류 발생:', error);
  }
}

// 완벽한 직각 폴리곤 생성 함수 
function createPerfectRectanglePolygon(originalCoords, offsetDistanceKm, side = 'right') {
  // 원본 선의 모든 좌표를 WGS84로 변환
  const wgs84Coords = originalCoords.map(coord => 
    transform(coord, 'EPSG:3857', 'EPSG:4326')
  );
  
  if (wgs84Coords.length < 2) {
    console.error('최소 2개의 점이 필요합니다.');
    return;
  }
  
  try {
    // 수학적으로 정확한 직각 폴리곤 생성
    const startPoint = wgs84Coords[0];
    const endPoint = wgs84Coords[wgs84Coords.length - 1];
    
    // 원본선의 방향(베어링) 계산
    const lineBearing = turf.bearing(startPoint, endPoint);
    
    if (side === 'right') {
      // 오른쪽 직각 폴리곤: 시작점에서 오른쪽 90도, 끝점에서 오른쪽 90도
      const startRightPoint = turf.destination(startPoint, offsetDistanceKm, lineBearing + 90, {units: 'kilometers'});
      const endRightPoint = turf.destination(endPoint, offsetDistanceKm, lineBearing + 90, {units: 'kilometers'});
      
      // 완벽한 직각 사각형
      const rectangleCoords = [
        startPoint,                           // 원본 시작점
        endPoint,                             // 원본 끝점  
        endRightPoint.geometry.coordinates,   // 끝점에서 오른쪽으로 90도
        startRightPoint.geometry.coordinates, // 시작점에서 오른쪽으로 90도
        startPoint                            // 시작점으로 닫기
      ];
      
      createPolygonFeature(rectangleCoords, '#00ff0080', '오른쪽 완벽한 직각 폴리곤');
      
    } else if (side === 'left') {
      // 왼쪽 직각 폴리곤: 시작점에서 왼쪽 90도, 끝점에서 왼쪽 90도  
      const startLeftPoint = turf.destination(startPoint, offsetDistanceKm, lineBearing - 90, {units: 'kilometers'});
      const endLeftPoint = turf.destination(endPoint, offsetDistanceKm, lineBearing - 90, {units: 'kilometers'});
      
      // 완벽한 직각 사각형
      const rectangleCoords = [
        startPoint,                          // 원본 시작점
        endPoint,                            // 원본 끝점
        endLeftPoint.geometry.coordinates,   // 끝점에서 왼쪽으로 90도
        startLeftPoint.geometry.coordinates, // 시작점에서 왼쪽으로 90도  
        startPoint                           // 시작점으로 닫기
      ];
      
      createPolygonFeature(rectangleCoords, '#ff000080', '왼쪽 완벽한 직각 폴리곤');
      
    } else if (side === 'both') {
      // 양쪽 직각 폴리곤: 왼쪽 90도와 오른쪽 90도로 큰 사각형
      const startLeftPoint = turf.destination(startPoint, offsetDistanceKm, lineBearing - 90, {units: 'kilometers'});
      const startRightPoint = turf.destination(startPoint, offsetDistanceKm, lineBearing + 90, {units: 'kilometers'});
      const endLeftPoint = turf.destination(endPoint, offsetDistanceKm, lineBearing - 90, {units: 'kilometers'});
      const endRightPoint = turf.destination(endPoint, offsetDistanceKm, lineBearing + 90, {units: 'kilometers'});
      
      // 완벽한 직각 사각형 (큰 사각형)
      const rectangleCoords = [
        startLeftPoint.geometry.coordinates,  // 시작점 왼쪽
        endLeftPoint.geometry.coordinates,    // 끝점 왼쪽
        endRightPoint.geometry.coordinates,   // 끝점 오른쪽
        startRightPoint.geometry.coordinates, // 시작점 오른쪽
        startLeftPoint.geometry.coordinates   // 시작점 왼쪽으로 닫기
      ];
      
      createPolygonFeature(rectangleCoords, '#0000ff80', '양쪽 완벽한 직각 폴리곤');
    }
    
    console.log(`완벽한 직각 폴리곤 생성 완료: ${side} 방향`, {
      side: side,
      offsetDistance: offsetDistanceKm + 'km',
      method: '수학적 정확한 90도 계산'
    });
    
  } catch (error) {
    console.error('폴리곤 생성 중 오류 발생:', error);
  }
}

// 선형 Feature 생성 함수
function createLineFeature(lineCoords, strokeColor, label) {
  // WGS84 좌표를 다시 OpenLayers 좌표계로 변환
  const projectedCoords = lineCoords.map(coord => 
    transform(coord, 'EPSG:4326', 'EPSG:3857')
  );
  
  // LineString Feature 생성
  const line = new Feature({
    geometry: new LineString(projectedCoords)
  });
  
  // 선 스타일
  line.setStyle(new Style({
    stroke: new Stroke({
      color: strokeColor,
      width: 3
    })
  }));
  
  // 벡터 레이어에 추가
  vectorLayer.getSource().addFeature(line);
  
  console.log(`${label} 생성:`, {
    pointsCount: projectedCoords.length,
    color: strokeColor
  });
}

function createPolygonFeature(polygonCoords, fillColor, label) {
  // WGS84 좌표를 다시 OpenLayers 좌표계로 변환
  const projectedCoords = polygonCoords.map(coord => 
    transform(coord, 'EPSG:4326', 'EPSG:3857')
  );
  
  // 폴리곤 좌표는 [외부링] 형태로 래핑
  const polygon = new Feature({
    geometry: new Polygon([projectedCoords])
  });
  
  // 폴리곤 스타일 (채우기 + 테두리)
  polygon.setStyle(new Style({
    fill: new Fill({
      color: fillColor
    }),
    stroke: new Stroke({
      color: fillColor.replace('80', 'ff'), // 불투명한 테두리
      width: 2
    })
  }));
  
  // 벡터 레이어에 추가
  vectorLayer.getSource().addFeature(polygon);
  
  console.log(`${label} 생성:`, {
    pointsCount: projectedCoords.length,
    color: fillColor
  });
}




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
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import Circle from 'ol/style/Circle.js';
import Text from 'ol/style/Text.js';
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

// 거리재기를 위한 별도 레이어
const measureSource = new VectorSource();
const measureLayer = new VectorLayer({
  source: measureSource,
  style: function(feature) {
    const geometry = feature.getGeometry();
    const styles = [];
    
    if (geometry.getType() === 'LineString') {
      // 거리재기 선 스타일
      styles.push(new Style({
        stroke: new Stroke({
          color: '#ff6b00',
          width: 3,
          lineDash: [10, 10]
        }),
        text: new Text({
          font: '14px Arial',
          fill: new Fill({ color: '#000' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
          text: feature.get('distance'),
          placement: 'line',
          maxAngle: 0
        })
      }));
    }
    
    // 측정점 스타일
    if (geometry.getType() === 'Point') {
      styles.push(new Style({
        image: new Circle({
          radius: 5,
          fill: new Fill({ color: '#ff6b00' }),
          stroke: new Stroke({ color: '#fff', width: 2 })
        })
      }));
    }
    
    return styles;
  }
});

let draw;
let measureDraw;
let currentMode = 'draw'; // 'draw' or 'measure'

// 지도 초기화
const map = new Map({
  target: 'map',
  layers: [
    new TileLayer({
      source: new OSM()
    }),
    vectorLayer,
    measureLayer
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
  if (currentMode === 'draw') {
    draw = new Draw({
      source: source,
      type: 'LineString',
    });
    map.addInteraction(draw);
  } else if (currentMode === 'measure') {
    measureDraw = new Draw({
      source: measureSource,
      type: 'LineString',
    });
    
    measureDraw.on('drawend', function(event) {
      const feature = event.feature;
      const geometry = feature.getGeometry();
      const coordinates = geometry.getCoordinates();
      
      // 좌표를 WGS84로 변환하여 거리 계산
      const wgs84Coords = coordinates.map(coord => 
        transform(coord, 'EPSG:3857', 'EPSG:4326')
      );
      
      // Turf.js를 사용하여 총 거리 계산
      let totalDistance = 0;
      for (let i = 0; i < wgs84Coords.length - 1; i++) {
        const distance = turf.distance(wgs84Coords[i], wgs84Coords[i + 1], { units: 'meters' });
        totalDistance += distance;
      }
      
      // 거리 정보를 피처에 저장
      let distanceText;
      if (totalDistance >= 1000) {
        distanceText = `${(totalDistance / 1000).toFixed(2)} km`;
      } else {
        distanceText = `${totalDistance.toFixed(2)} m`;
      }
      
      feature.set('distance', distanceText);
      
      console.log('측정된 거리:', distanceText);
      alert(`측정된 거리: ${distanceText}`);
    });
    
    map.addInteraction(measureDraw);
  }
}

function clearInteractions() {
  if (draw) {
    map.removeInteraction(draw);
    draw = null;
  }
  if (measureDraw) {
    map.removeInteraction(measureDraw);
    measureDraw = null;
  }
}

addInteractions();

// 버튼 이벤트 리스너들
document.getElementById('btn-draw').addEventListener('click', () => {
  currentMode = 'draw';
  clearInteractions();
  addInteractions();
  console.log('그리기 모드 활성화');
});

document.getElementById('btn-measure').addEventListener('click', () => {
  currentMode = 'measure';
  clearInteractions();
  addInteractions();
  console.log('거리재기 모드 활성화');
});

document.getElementById('btn-select').addEventListener('click', () => {
  clearInteractions();
  console.log('선택 모드 활성화 (상호작용 비활성화)');
});

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
  
  // 폴리곤을 50m 양쪽에 생성 (완벽한 직각 폴리곤 알고리즘 사용)
  createAddPolyline(coords, 5, 'both'); // 5m 거리로 평행선 생성
  
  alert(`
    베어링(방위각): ${bearing.toFixed(2)}도
    거리: ${distance.toFixed(2)}km
    
    폴리곤이 5m 양쪽에 생성되었습니다.
    
    점1: [${point1[1].toFixed(6)}, ${point1[0].toFixed(6)}]
    점2: [${point2[1].toFixed(6)}, ${point2[0].toFixed(6)}]
  `);
})


function createAddPolyline(coords, distance, type) {
  // OpenLayers 좌표를 WGS84로 변환
  const wgs84Coords = coords.map(coord => 
    transform(coord, 'EPSG:3857', 'EPSG:4326')
  );
  
  // 시작점을 2m 뒤로, 종료점을 2m 앞으로 연장
  const extendedCoords = [];
  
  // 첫 번째 점을 2m 뒤로 연장
  if (wgs84Coords.length >= 2) {
    const firstBearing = turf.bearing(wgs84Coords[0], wgs84Coords[1]);
    const backwardBearing = firstBearing + 180; // 반대 방향
    const extendedStart = turf.destination(wgs84Coords[0], 2, backwardBearing, { units: 'meters' });
    extendedCoords.push(extendedStart.geometry.coordinates);
  }
  
  // 원래 좌표들 추가
  extendedCoords.push(...wgs84Coords);
  
  // 마지막 점을 2m 앞으로 연장
  if (wgs84Coords.length >= 2) {
    const lastIndex = wgs84Coords.length - 1;
    const lastBearing = turf.bearing(wgs84Coords[lastIndex - 1], wgs84Coords[lastIndex]);
    const extendedEnd = turf.destination(wgs84Coords[lastIndex], 2, lastBearing, { units: 'meters' });
    extendedCoords.push(extendedEnd.geometry.coordinates);
  }
  
  // 연장된 좌표로 평행선 생성
  const leftCoords = [];
  const rightCoords = [];
  
  for (let i = 0; i < extendedCoords.length; i++) {
    const currentPoint = extendedCoords[i];
    let perpendicularBearing;
    
    if (i === 0) {
      // 첫 번째 점: 다음 점으로의 방향에 수직
      const bearing = turf.bearing(currentPoint, extendedCoords[i + 1]);
      perpendicularBearing = bearing;
    } else if (i === extendedCoords.length - 1) {
      // 마지막 점: 이전 점으로부터의 방향에 수직
      const bearing = turf.bearing(extendedCoords[i - 1], currentPoint);
      perpendicularBearing = bearing;
    } else {
      // 중간 점: 이전 점과 다음 점을 고려한 각 이등분선에 수직
      const prevPoint = extendedCoords[i - 1];
      const nextPoint = extendedCoords[i + 1];
      
      // 이전 점에서 현재 점으로의 방향
      const bearingFromPrev = turf.bearing(prevPoint, currentPoint);
      // 현재 점에서 다음 점으로의 방향
      const bearingToNext = turf.bearing(currentPoint, nextPoint);
      
      // 각 이등분선 계산 (정확한 각도 처리)
      let angleDiff = bearingToNext - bearingFromPrev;
      
      // 각도 정규화 (-180 ~ 180도)
      while (angleDiff > 180) angleDiff -= 360;
      while (angleDiff < -180) angleDiff += 360;
      
      // 각 이등분선의 방향
      let bisectorBearing = bearingFromPrev + angleDiff / 2;
      
      // 베어링 정규화
      while (bisectorBearing > 180) bisectorBearing -= 360;
      while (bisectorBearing < -180) bisectorBearing += 360;
      
      perpendicularBearing = bisectorBearing;
    }
    
    // 왼쪽 및 오른쪽 방향 계산 (수직 방향으로 90도 회전)
    const leftBearing = perpendicularBearing - 90;
    const rightBearing = perpendicularBearing + 90;
    
    // 거리 보정 적용 (중간점인 경우만)
    let correctedDistance = distance;
    if (i > 0 && i < extendedCoords.length - 1) {
      const prevPoint = extendedCoords[i - 1];
      const nextPoint = extendedCoords[i + 1];
      const bearingFromPrev = turf.bearing(prevPoint, currentPoint);
      const bearingToNext = turf.bearing(currentPoint, nextPoint);
      
      let angleDiff = bearingToNext - bearingFromPrev;
      while (angleDiff > 180) angleDiff -= 360;
      while (angleDiff < -180) angleDiff += 360;
      
      const absAngleDiff = Math.abs(angleDiff);
      if (absAngleDiff > 10) {
        const distanceCorrection = 1 / Math.cos((absAngleDiff * Math.PI / 180) / 2);
        correctedDistance = distance * Math.min(distanceCorrection, 3);
      }
    }
    
    // 현재 점에서 왼쪽/오른쪽으로 지정된 거리만큼 이동한 점 계산 (미터 단위)
    const leftPoint = turf.destination(currentPoint, correctedDistance, leftBearing, { units: 'meters' });
    const rightPoint = turf.destination(currentPoint, correctedDistance, rightBearing, { units: 'meters' });
    
    leftCoords.push(leftPoint.geometry.coordinates);
    rightCoords.push(rightPoint.geometry.coordinates);
    
    console.log(`점 ${i}: 각도=${perpendicularBearing.toFixed(2)}도, 보정거리=${correctedDistance.toFixed(2)}m`);
  }
  
  // 스무딩 없이 정확한 계산 결과 사용
  const smoothLeftCoords = leftCoords;  // 스무딩 비활성화
  const smoothRightCoords = rightCoords; // 스무딩 비활성화
  
  // 좌표를 다시 OpenLayers 투영계로 변환
  const leftOlCoords = smoothLeftCoords.map(coord => 
    transform(coord, 'EPSG:4326', 'EPSG:3857')
  );
  const rightOlCoords = smoothRightCoords.map(coord => 
    transform(coord, 'EPSG:4326', 'EPSG:3857')
  );
  
  // 왼쪽 평행선 생성
  if (type === 'left' || type === 'both') {
    const leftLine = new Feature({
      geometry: new LineString(leftOlCoords)
    });
    leftLine.setStyle(new Style({
      stroke: new Stroke({
        color: '#ff0000', // 빨간색
        width: 3
      })
    }));
    source.addFeature(leftLine);
    
    console.log(`왼쪽 평행선 생성됨 (${distance}m 거리):`, smoothLeftCoords);
  }
  
  // 오른쪽 평행선 생성
  if (type === 'right' || type === 'both') {
    const rightLine = new Feature({
      geometry: new LineString(rightOlCoords)
    });
    rightLine.setStyle(new Style({
      stroke: new Stroke({
        color: '#00ff00', // 초록색
        width: 3
      })
    }));
    source.addFeature(rightLine);
    
    console.log(`오른쪽 평행선 생성됨 (${distance}m 거리):`, smoothRightCoords);
  }
  
  // 폴리곤 생성 (양쪽 지점에 보간점 추가)
  if (type === 'both') {
    // 원본 라인과 양쪽 평행선으로 폴리곤 생성
    const polygonCoords = [
      ...leftOlCoords,
      ...rightOlCoords.reverse(),
      leftOlCoords[0] // 폴리곤 닫기
    ];
    
    const polygon = new Feature({
      geometry: new Polygon([polygonCoords])
    });
    polygon.setStyle(new Style({
      fill: new Fill({
        color: 'rgba(255, 255, 0, 0.3)' // 반투명 노란색
      }),
      stroke: new Stroke({
        color: '#ffff00',
        width: 2
      })
    }));
    source.addFeature(polygon);
    
    console.log(`폴리곤 생성됨 (양쪽 ${distance}m 간격)`);
  }
}



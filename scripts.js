document.addEventListener('DOMContentLoaded', async function () {
    const regionSelect       = document.querySelector('.region-select');
    const image              = document.getElementById('radar-image');
    const slider             = document.getElementById('time-slider');
    const speedDisplay       = document.querySelector('.speed-display');
    const playPauseButton    = document.querySelector('.pause-btn');
    const slowerButton       = document.getElementById('slower');
    const fasterButton       = document.getElementById('faster');
    const lastRefresh        = document.querySelector('.refresh-time');
    const timeDisplay        = document.querySelector('.image-time');
    const nowDisplay         = document.querySelector('.now');
    const centerCheckbox     = document.getElementById('center');
    const windVectorCheckbox = document.getElementById('wv');
    const awsCheckbox        = document.getElementById('aws');
    const topoCheckbox       = document.getElementById('topo');
    const lightningCheckbox  = document.getElementById('lightning');
    const latInput           = document.getElementById('lat-display');
    const lonInput           = document.getElementById('lon-display');
    const radInput           = document.getElementById('rad-display');
    const latDownButton      = document.getElementById('down-button-lat');
    const latUpButton        = document.getElementById('up-button-lat');
    const lonDownButton      = document.getElementById('down-button-lon');
    const lonUpButton        = document.getElementById('up-button-lon');
    const zoomOutButton      = document.getElementById('zoom-out-button');
    const zoomInButton       = document.getElementById('zoom-in-button');
    const zeroButton         = document.getElementById('zero-button');
    const okButton           = document.getElementById('ok-button');

    const baseURL = "https://radar.kma.go.kr/cgi-bin/center/nph-rdr_cmp_img?cmp=HSP&color=C4&qcd=HSO&obs=ECHO&map=HB&size=800&gis=1&legend=1&gov=KMA";
    let includeGcT = false;

    function updateBaseURL() {
        return includeGcT ? baseURL + "&gc=T" : baseURL;
    }

    const regionConfigs = {
        '전국/선택지점[4시간]': { url: "&lonlat=0&lat=35.90&lon=127.80&zoom=2&ht=1000", interval: 5, frames: 48 },
        '수도권[2시간]':       { url: "&lonlat=0&lat=37.57&lon=126.97&zoom=4.9&ht=1000", interval: 5, frames: 24 },
        '충청권[2시간]':       { url: "&lonlat=0&lat=36.49&lon=127.24&zoom=4.9&ht=1000", interval: 5, frames: 24 },
        '호남권[2시간]':       { url: "&lonlat=0&lat=35.17&lon=126.89&zoom=4.9&ht=1000", interval: 5, frames: 24 },
        '경남권[2시간]':       { url: "&lonlat=0&lat=35.22&lon=128.67&zoom=4.9&ht=1000", interval: 5, frames: 24 },
        '경북권[2시간]':       { url: "&lonlat=0&lat=36.25&lon=128.56&zoom=4.9&ht=1000", interval: 5, frames: 24 },
        '강원권[2시간]':       { url: "&lonlat=0&lat=37.78&lon=128.40&zoom=4.9&ht=1000", interval: 5, frames: 24 },
        '제주권[2시간]':       { url: "&lonlat=0&lat=33.38&lon=126.53&zoom=4.9&ht=1000", interval: 5, frames: 24 },
        '동아시아[24시간]':    { url: "&lonlat=0&lat=33.11&lon=126.27&zoom=0.5&ht=1000", interval: 30, frames: 48 }
    };

    let selectedRegionConfig = regionConfigs['전국/선택지점[4시간]'];
    let intervalId    = null;
    let reloadTimer   = null;
    let isPlaying     = true;
    let preloadedImages = [];
    let speed         = parseInt(localStorage.getItem('speed')) || 500;
    let imageTimes    = [];
    let userPaused    = false;
    let lastUpdateRegion, lastUpdateCenter, lastUpdateWindVector, lastUpdateAws, lastUpdateTopo, lastUpdateLightning;

    // 저장된 설정 불러오기
    const savedRegion    = localStorage.getItem('region-select');
    const savedCenter    = localStorage.getItem('center')    === '1';
    const savedWindVector= localStorage.getItem('wv')        === '1';
    const savedAws       = localStorage.getItem('aws')       === '1';
    const savedTopo      = localStorage.getItem('topo')      === '1';
    const savedLightning = localStorage.getItem('lightning') === '1';

    if (savedRegion)     { selectedRegionConfig = regionConfigs[savedRegion]; regionSelect.value = savedRegion; }
    if (savedCenter)     centerCheckbox.checked = true;
    if (savedWindVector) windVectorCheckbox.checked = true;
    if (savedAws)        awsCheckbox.checked = true;
    if (savedTopo)       topoCheckbox.checked = true;
    if (savedLightning)  lightningCheckbox.checked = true;

    let latParam = localStorage.getItem('lat');
    let lonParam = localStorage.getItem('lon');
    let radParam = localStorage.getItem('rad');

    // 서버 시간 가져오기 (예외 처리 포함)
    async function getInternetTime() {
        try {
            const res = await fetch('https://worldtimeapi.org/api/timezone/Asia/Seoul', { mode: 'cors' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return new Date(data.datetime);
        } catch (err) {
            console.error('서버 시간 로드 실패:', err);
            return new Date();  // 클라이언트 시간으로 대체
        }
    }

    function formatDate(date, type = "url") {
        const y   = date.getFullYear();
        const m   = ('0' + (date.getMonth()+1)).slice(-2);
        const d   = ('0' + date.getDate()).slice(-2);
        const h   = ('0' + date.getHours()).slice(-2);
        const min = ('0' + date.getMinutes()).slice(-2);
        const s   = ('0' + date.getSeconds()).slice(-2);
        if (type === "url")     return `${y}${m}${d}${h}${min}`;
        else if (type === "display") return `${y}.${m}.${d} ${h}:${min}:${s}`;
        else if (type === "image")   return `${y}. ${m}. ${d}.  ${h}:${min}`;
    }

    // 이미지 URL 목록 생성
    function mergeParams(url) {
        const params = new URLSearchParams(url.replace(/^&/, ''));
        if (latParam) params.set('lat', latParam);
        if (lonParam) params.set('lon', lonParam);
        if (radParam) params.set('zoom', (574*Math.pow(radParam,-1.001)).toFixed(2));
        return '&' + params.toString();
    }

    async function generateImageURLs() {
        const urls     = [];
        const nowKST   = await getInternetTime();
        const interval = selectedRegionConfig.interval;
        nowKST.setMinutes(Math.floor(nowKST.getMinutes()/interval)*interval);
        nowKST.setSeconds(0); nowKST.setMilliseconds(0);
        imageTimes = [];

        for (let i = 0; i < selectedRegionConfig.frames; i++) {
            const date    = new Date(nowKST.getTime() - i * interval * 60000);
            const tm      = formatDate(date, "url");

            const regionUrl = mergeParams(selectedRegionConfig.url);

            const url = `${updateBaseURL()}&center=${centerCheckbox.checked?1:0}` +
                        `&wv=${windVectorCheckbox.checked?1:0}` +
                        `&aws=${awsCheckbox.checked?1:0}` +
                        `&topo=${topoCheckbox.checked?1:0}` +
                        `&lightning=${lightningCheckbox.checked?1:0}` +
                        `${regionUrl}&tm=${tm}`;
            urls.push(url);
            imageTimes.push(date);
        }
        return urls.reverse();
    }

    // 이미지 갱신 및 preload
    async function updateImages(force = false) {
        if (!force &&
            lastUpdateRegion     === regionSelect.value &&
            lastUpdateCenter     === (centerCheckbox.checked?1:0) &&
            lastUpdateWindVector === (windVectorCheckbox.checked?1:0) &&
            lastUpdateAws        === (awsCheckbox.checked?1:0) &&
            lastUpdateTopo       === (topoCheckbox.checked?1:0) &&
            lastUpdateLightning  === (lightningCheckbox.checked?1:0)
        ) return;

        const urls = await generateImageURLs();
        imageTimes.reverse(); // Reverse imageTimes to match reversed urls
        preloadedImages = urls.map((url, idx) => {
            const img = new Image();
            img.src = url;
            img.onerror = () => {
                console.warn(`이미지 로딩 실패: ${url}`);
                if (!reloadTimer) {
                    reloadTimer = setInterval(() => location.reload(), 2000);
                }
            };
            img.onload = () => {
                if (reloadTimer) {
                    clearInterval(reloadTimer);
                    reloadTimer = null;
                }
            };
            return { img, time: imageTimes[idx] };
        });

        slider.max = selectedRegionConfig.frames - 1;
        slider.value = 0;
        slider.addEventListener('input', () => {
            const i = slider.value;
            if (preloadedImages[i]) {
                image.src = preloadedImages[i].img.src;
                timeDisplay.textContent = formatDate(preloadedImages[i].time, "image");
            }
        });
        
        if (preloadedImages.length > 0) {
            image.src = preloadedImages[0].img.src;
            image.style.width = "100%";
            timeDisplay.textContent = formatDate(preloadedImages[0].time, "image");
        }

        if (isPlaying) startAutoPlay();

        lastUpdateRegion     = regionSelect.value;
        lastUpdateCenter     = centerCheckbox.checked?1:0;
        lastUpdateWindVector = windVectorCheckbox.checked?1:0;
        lastUpdateAws        = awsCheckbox.checked?1:0;
        lastUpdateTopo       = topoCheckbox.checked?1:0;
        lastUpdateLightning  = lightningCheckbox.checked?1:0;
    }

    // 자동 재생
    function startAutoPlay() {
        clearInterval(intervalId);
        intervalId = setInterval(() => {
            let nextValue = (parseInt(slider.value) + 1);
            if (nextValue >= selectedRegionConfig.frames) {
                nextValue = 0;
            }
            slider.value = nextValue;
            if (preloadedImages[nextValue]) {
                image.src = preloadedImages[nextValue].img.src;
                timeDisplay.textContent = formatDate(preloadedImages[nextValue].time, "image");
            }
        }, speed);
    }

    // 버튼 이벤트
    playPauseButton.addEventListener('click', () => {
        if (isPlaying) {
            clearInterval(intervalId);
            playPauseButton.textContent = '재생';
            userPaused = true;
        } else {
            startAutoPlay();
            playPauseButton.textContent = '정지';
            userPaused = false;
        }
        isPlaying = !isPlaying;
    });

    fasterButton.addEventListener('click', () => {
        if (speed > 100) {
            speed -= 100;
            speedDisplay.textContent = `${(speed/1000).toFixed(1)} s/frame`;
            localStorage.setItem('speed', speed);
            if (isPlaying) { clearInterval(intervalId); startAutoPlay(); }
        }
    });

    slowerButton.addEventListener('click', () => {
        if (speed < 2000) {
            speed += 100;
            speedDisplay.textContent = `${(speed/1000).toFixed(1)} s/frame`;
            localStorage.setItem('speed', speed);
            if (isPlaying) { clearInterval(intervalId); startAutoPlay(); }
        }
    });

    // 입력 상태 업데이트
    function updateInputState() {
        const disabled = regionSelect.value !== '전국/선택지점[4시간]';
        latInput.disabled = lonInput.disabled = radInput.disabled = disabled;
        if (disabled) {
            latInput.value = '';
            lonInput.value = '';
            radInput.value = '';
            latInput.placeholder = "전국/선택지점";
            lonInput.placeholder = "에서 좌표 지정";
            radInput.placeholder = "";
        } else {
            loadLatLonZoom();
            latInput.placeholder = "위도(32°~44°)";
            lonInput.placeholder = "경도(123°~131°)";
            radInput.placeholder = "반경(km)";
        }
        zeroButton.classList.toggle('highlight', !!(latInput.value||lonInput.value||radInput.value));
    }

    // 값 증감 함수
    function modifyValue(el, inc) {
        if (!el.disabled) {
            let v = parseFloat(el.value) || (el === latInput ? 35.90 : 127.80);
            v += inc;
            el.value = (el === radInput ? Math.max(0,v).toFixed(0) : v.toFixed(2));
            saveLatLonZoom();
        }
    }
    function setupHold(btn, el, inc) {
        let tid, iid;
        const start = () => {
            modifyValue(el, inc);
            iid = setTimeout(() => {
                tid = setInterval(() => modifyValue(el, inc), 100);
            }, 500);
        };
        const stop = () => {
            clearTimeout(iid);
            clearInterval(tid);
        };
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', stop);
        btn.addEventListener('mouseleave', stop);
    }
    setupHold(latDownButton, latInput, -0.01);
    setupHold(latUpButton,   latInput,  0.01);
    setupHold(lonDownButton, lonInput, -0.01);
    setupHold(lonUpButton,   lonInput,  0.01);
    setupHold(zoomOutButton, radInput, 10); // 반경이 클수록 zoom out
    setupHold(zoomInButton,  radInput, -10); // 반경이 작을수록 zoom in

    // 로컬스토리지 저장/불러오기
    function saveLatLonZoom() {
        localStorage.setItem('lat', latInput.value);
        localStorage.setItem('lon', lonInput.value);
        localStorage.setItem('rad', radInput.value);
        latParam = latInput.value; lonParam = lonInput.value; radParam = radInput.value;
        zeroButton.classList.toggle('highlight', !!(latInput.value||lonInput.value||radInput.value));
    }
    function loadLatLonZoom() {
        const l = localStorage.getItem('lat');
        const o = localStorage.getItem('lon');
        const r = localStorage.getItem('rad');
        if (l) latInput.value = l;
        if (o) lonInput.value = o;
        if (r) radInput.value = r;
    }
    
    // 셀렉트/체크박스 변경
    regionSelect.addEventListener('change', () => {
        selectedRegionConfig = regionConfigs[regionSelect.value];
        localStorage.setItem('region-select', regionSelect.value);
        latParam = lonParam = radParam = null;
        localStorage.removeItem('lat');
        localStorage.removeItem('lon');
        localStorage.removeItem('rad');
        updateImages(true);
        updateInputState();
    });
    [centerCheckbox, windVectorCheckbox, awsCheckbox, topoCheckbox, lightningCheckbox]
    .forEach(chk => chk.addEventListener('change', () => {
        localStorage.setItem(chk.id, chk.checked?'1':'0');
        updateImages(true);
    }));

    // 확인 버튼 (좌표 설정)
    okButton.addEventListener('click', async () => {
        if (regionSelect.value !== '전국/선택지점[4시간]') {
            alert('전국/선택지점[4시간] 옵션에서만 좌표를 설정할 수 있습니다.');
            return;
        }
        let lat = latInput.value, lon = lonInput.value, rad = radInput.value;
        if (String(lat).includes('°')||String(lat).includes("'")||String(lat).includes('"')) lat = dmsToDecimal(lat);
        if (String(lon).includes('°')||String(lon).includes("'")||String(lon).includes('"')) lon = dmsToDecimal(lon);
        latInput.value = parseFloat(lat).toFixed(2);
        lonInput.value = parseFloat(lon).toFixed(2);
        radInput.value = rad||'';
        const validLat = lat>=32&&lat<=44;
        const validLon = lon>=123&&lon<=131;
        const validRad = rad===''||rad>0;
        const invalid = [];
        if (!validLat) invalid.push('위도');
        if (!validLon) invalid.push('경도');
        if (!validRad) invalid.push('반경');
        if (invalid.length) {
            alert('유효하지 않은 ' + invalid.join(', ') + ' 값입니다.');
        } else {
            saveLatLonZoom();
            await updateImages(true);
            location.reload();
        }
    });

    // 기본값 복원
    zeroButton.addEventListener('click', () => {
        latInput.value = '';
        lonInput.value = '';
        radInput.value = '';
        saveLatLonZoom();
        updateImages(true);
        if (!isPlaying) {
            startAutoPlay();
            playPauseButton.textContent = '정지';
            isPlaying = true;
            userPaused = false;
        }
    });

    // 시간 표시 업데이트
    function updateTimeDisplays() {
        nowDisplay.textContent = `현재: ${formatDate(new Date(), 'display')}`;
    }
    function updateRefreshTime() {
        lastRefresh.textContent = `갱신: ${formatDate(new Date(), 'display')}`;
    }

    // DMS → Decimal 변환
    function dmsToDecimal(dms) {
        const p = String(dms).match(/(\d+(\.\d+)?)/g) || [];
        const deg = parseFloat(p[0]) || 0;
        const min = (parseFloat(p[1]) || 0) / 60;
        const sec = (parseFloat(p[2]) || 0) / 3600;
        return deg + min + sec;
    }

    // 초기화
    updateInputState();
    await updateImages(true);
    updateTimeDisplays();
    updateRefreshTime();
    speedDisplay.textContent = `${(speed/1000).toFixed(1)} s/frame`;

    // 5분마다 자동 새로고침 (사용자 일시정지 아닐 때)
    setInterval(() => { if (!userPaused) location.reload(); }, 300000);

    // 매초 현재 시간 갱신
    setInterval(updateTimeDisplays, 1000);
});

// 화면 더블 클릭 시 전체 화면 전환/해제
document.body.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
            console.log(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
});


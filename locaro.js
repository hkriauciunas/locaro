window.Locaro = {
  version:"0.1.0",
  init(config = {}) {


if (this._initialized) {
  console.warn("Locaro already initialized.");
  return;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => this.init(config));
  return;
}

this._initialized = true;

console.info(`Locaro v${Locaro.version} initialized`);


    // -----------------------------
    // CONFIG
    // -----------------------------
    const mapSelector = config.map || "#map";
    const resultsSelector = config.results || "#map-results";
    const filtersSelector = config.filters || "#map-filters";
    const searchSelector = config.search || "#map-search";
    const itemsSelector = config.items || ".map-data-item";
    const resultsCountSelector = config.resultsCount || "#map-results-count";
    const token = config.token || "";

    if (!token) {
      console.error("Locaro: Missing Mapbox token.");
      return;
    }

    mapboxgl.accessToken = token;

    // -----------------------------
    // SELECTORS
    // -----------------------------
    const mapContainer = document.querySelector(mapSelector);
    const filtersContainer = document.querySelector(filtersSelector);
    const searchInput = document.querySelector(searchSelector);
    const resultsContainer = document.querySelector(resultsSelector);
    const resultsCountElement = document.querySelector(resultsCountSelector);
    const items = Array.from(document.querySelectorAll(itemsSelector));

    if (!mapContainer) {
      console.error(`Locaro: Map container not found for selector "${mapSelector}".`);
      return;
    }

    if (!items.length) {
      console.error(`Locaro: No items found for selector "${itemsSelector}".`);
      return;
    }

    // -----------------------------
    // STATE
    // -----------------------------
    let activeCategory = "all";
    let searchQuery = "";
    let activeLocationKey = "";
    let activePopup = null;

    // -----------------------------
    // DATA PARSING
    // -----------------------------
    const features = items
      .map((item, index) => {
        const lat = parseFloat(item.dataset.lat);
        const lng = parseFloat(item.dataset.lng);

        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

        const title = item.dataset.title || "";
        const category = item.dataset.category || "";
        const address = item.dataset.address || "";
        const image = item.dataset.image || "";
        const url = item.dataset.url || "";
        const key = item.dataset.key || url || title || `${lat}-${lng}-${index}`;

        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lng, lat]
          },
          properties: {
            key,
            title,
            category,
            address,
            image,
            url
          }
        };
      })
      .filter(Boolean);

    function createGeojson(featureList) {
      return {
        type: "FeatureCollection",
        features: featureList
      };
    }

    const geojson = createGeojson(features);

    // -----------------------------
    // MAP INIT
    // -----------------------------
    const map = new mapboxgl.Map({
      container: mapContainer,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [10.0, 59.5],
      zoom: 5
    });

    // -----------------------------
    // FILTER / SEARCH HELPERS
    // -----------------------------
    function getFilteredFeatures() {
      let filtered = features;

      if (activeCategory !== "all") {
        filtered = filtered.filter(
          (feature) => feature.properties.category === activeCategory
        );
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase();

        filtered = filtered.filter((feature) => {
          const { title, address, category } = feature.properties;

          return (
            title?.toLowerCase().includes(query) ||
            address?.toLowerCase().includes(query) ||
            category?.toLowerCase().includes(query)
          );
        });
      }

      return filtered;
    }

    function getFilteredGeojson() {
      return createGeojson(getFilteredFeatures());
    }

    function getUniqueCategories() {
      const categories = features
        .map((feature) => feature.properties.category)
        .filter(Boolean);

      return [...new Set(categories)].sort();
    }

    // -----------------------------
    // UI HELPERS
    // -----------------------------
    function updateActiveFilterButton() {
      document.querySelectorAll("[data-map-filter]").forEach((button) => {
        const isActive = button.dataset.mapFilter === activeCategory;
        button.classList.toggle("is-active", isActive);
      });
    }

    function renderFilterButtons() {
      if (!filtersContainer) return;

      const categories = getUniqueCategories();

      filtersContainer.innerHTML = `
        <button type="button" data-map-filter="all">All</button>
        ${categories
          .map(
            (category) =>
              `<button type="button" data-map-filter="${category}">${category}</button>`
          )
          .join("")}
      `;

      bindFilterEvents();
      updateActiveFilterButton();
    }

    function renderSidebar() {
      if (!resultsContainer) return;

      const filteredFeatures = getFilteredFeatures();

      if (resultsCountElement) {
        resultsCountElement.textContent = `${filteredFeatures.length} location${
          filteredFeatures.length === 1 ? "" : "s"
        }`;
      }

      if (!filteredFeatures.length) {
        resultsContainer.innerHTML =
          `<div class="map-result-empty">No locations found.</div>`;
        return;
      }

      resultsContainer.innerHTML = filteredFeatures
        .map((feature) => {
          const { key, title, address, category, image } = feature.properties;
          const isActive = key === activeLocationKey;

          return `
            <button
              class="map-result-card ${image ? "" : "no-image"} ${isActive ? "is-active" : ""}"
              type="button"
              data-location-key="${key}"
            >
              ${image ? `<img class="map-result-image" src="${image}" alt="${title}">` : ""}
              <div class="map-result-content">
                <div class="map-result-title">${title}</div>
                <div class="map-result-category">${category || ""}</div>
                <div class="map-result-address">${address || ""}</div>
              </div>
            </button>
          `;
        })
        .join("");
    }

    function scrollActiveSidebarCardIntoView() {
      const sidebar = document.querySelector(".map-sidebar");
      const activeCard = resultsContainer?.querySelector(".map-result-card.is-active");
      const stickyBar = document.querySelector(".map-sidebar-top");

      if (!sidebar || !activeCard) return;

      const stickyOffset = stickyBar ? stickyBar.offsetHeight : 0;

      const sidebarRect = sidebar.getBoundingClientRect();
      const cardRect = activeCard.getBoundingClientRect();

      const cardTopWithinSidebar = cardRect.top - sidebarRect.top + sidebar.scrollTop;
      const cardBottomWithinSidebar =
        cardTopWithinSidebar + activeCard.offsetHeight;

      const visibleTop = sidebar.scrollTop + stickyOffset;
      const visibleBottom = sidebar.scrollTop + sidebar.clientHeight;

      if (cardTopWithinSidebar < visibleTop) {
        sidebar.scrollTo({
          top: cardTopWithinSidebar - stickyOffset - 8,
          behavior: "smooth"
        });
      } else if (cardBottomWithinSidebar > visibleBottom) {
        sidebar.scrollTo({
          top: cardBottomWithinSidebar - sidebar.clientHeight + 8,
          behavior: "smooth"
        });
      }
    }

    // -----------------------------
    // MAP HELPERS
    // -----------------------------
    function fitMapToFeatures(featureList, maxZoom = 14) {
      if (!featureList.length) return;

      const bounds = new mapboxgl.LngLatBounds();

      featureList.forEach((feature) => {
        bounds.extend(feature.geometry.coordinates);
      });

      map.fitBounds(bounds, {
        padding: 60,
        maxZoom
      });
    }

    function openLocationPopup(feature) {
      const coords = feature.geometry.coordinates.slice();
      const { key, title, address, category, image, url } = feature.properties;

      if (activePopup) {
        activePopup.remove();
        activePopup = null;
      }

      activeLocationKey = key;
      renderSidebar();
      scrollActiveSidebarCardIntoView();

      const popup = new mapboxgl.Popup({ offset: 15 })
        .setLngLat(coords)
        .setHTML(`
          <div class="map-popup">
            ${image ? `<img class="map-popup-image" src="${image}" alt="${title}">` : ""}
            <div class="map-popup-title">${title}</div>
            ${category ? `<div class="map-popup-category">${category}</div>` : ""}
            ${address ? `<div class="map-popup-address">${address}</div>` : ""}
            ${url ? `<a class="map-popup-link" href="${url}">View more</a>` : ""}
          </div>
        `)
        .addTo(map);

      activePopup = popup;

      popup.on("close", () => {
        if (activePopup === popup) {
          activePopup = null;
          activeLocationKey = "";
          renderSidebar();
        }
      });
    }

    function updateMapData(options = {}) {
      const { shouldFitBounds = true } = options;

      const source = map.getSource("locations");
      if (!source) return;

      const filteredGeojson = getFilteredGeojson();
      const filteredFeatures = filteredGeojson.features;

      source.setData(filteredGeojson);
      renderSidebar();

      if (shouldFitBounds) {
        fitMapToFeatures(filteredFeatures);
      }
    }

    // -----------------------------
    // EVENT BINDING
    // -----------------------------
    function bindFilterEvents() {
      document.querySelectorAll("[data-map-filter]").forEach((button) => {
        button.addEventListener("click", () => {
          activeCategory = button.dataset.mapFilter;
          updateActiveFilterButton();
          updateMapData({ shouldFitBounds: true });
        });
      });
    }

    function bindSearchEvents() {
      if (!searchInput) return;

      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value.trim();
        updateMapData({ shouldFitBounds: false });
      });
    }

    function bindSidebarEvents() {
      if (!resultsContainer) return;

      resultsContainer.addEventListener("click", (e) => {
        const card = e.target.closest("[data-location-key]");
        if (!card) return;

        const locationKey = card.dataset.locationKey;

        const feature = getFilteredFeatures().find(
          (item) => item.properties.key === locationKey
        );

        if (!feature) return;

        map.easeTo({
          center: feature.geometry.coordinates,
          zoom: 15
        });

        openLocationPopup(feature);
      });
    }

    // -----------------------------
    // MAP LOAD
    // -----------------------------
    map.on("load", () => {
      map.addSource("locations", {
        type: "geojson",
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "locations",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1d7b81",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            10, 24,
            30, 30,
            50, 38
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "locations",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12
        },
        paint: {
          "text-color": "#ffffff"
        }
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "locations",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 8,
          "circle-color": "#1d7b81",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      });

      map.on("click", "clusters", (e) => {
        const clusterFeatures = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"]
        });

        if (!clusterFeatures.length) return;

        const clusterId = clusterFeatures[0].properties.cluster_id;

        map.getSource("locations").getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;

          map.easeTo({
            center: clusterFeatures[0].geometry.coordinates,
            zoom
          });
        });
      });

      map.on("click", "unclustered-point", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        openLocationPopup(feature);
      });

      ["clusters", "unclustered-point"].forEach((layerId) => {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      });

      renderFilterButtons();
      renderSidebar();
      bindSearchEvents();
      bindSidebarEvents();
      fitMapToFeatures(features, 12);
    });
  }
};
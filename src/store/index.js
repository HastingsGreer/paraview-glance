import JSZip from 'jszip';
import Vue from 'vue';
import Vuex from 'vuex';

import vtk from 'vtk.js/Sources/vtk';
import vtkProxyManager from 'vtk.js/Sources/Proxy/Core/ProxyManager';

import { ProxyManagerVuexPlugin } from 'paraview-glance/src/plugins';

import viewHelper from 'paraview-glance/src/components/core/VtkView/helper';
import ReaderFactory from 'paraview-glance/src/io/ReaderFactory';
import Config from 'paraview-glance/src/config';
import files from 'paraview-glance/src/store/fileLoader';
import views from 'paraview-glance/src/store/views';
import widgets from 'paraview-glance/src/store/widgets';

import { wrapMutationAsAction } from 'paraview-glance/src/utils';

const STATE_VERSION = 2;

// http://jsperf.com/typeofvar
function typeOf(o) {
  return {}.toString
    .call(o)
    .slice(8, -1)
    .toLowerCase();
}

// quick object merge using Vue.set
/* eslint-disable no-param-reassign */
function merge(dst, src) {
  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i];
    if (typeOf(dst[key]) === 'object' && typeOf(src[key]) === 'object') {
      Vue.set(dst, key, merge(dst[key], src[key]));
    } else {
      Vue.set(dst, key, src[key]);
    }
  }
  return dst;
}
/* eslint-enable no-param-reassign */

function changeActiveSliceDelta(proxyManager, delta) {
  const view = proxyManager.getActiveView();
  if (view.isA('vtkView2DProxy')) {
    const sliceReps = view
      .getRepresentations()
      .filter((r) => r.isA('vtkSliceRepresentationProxy'));
    if (sliceReps.length) {
      const rep = sliceReps[0];
      rep.setSlice(rep.getSlice() + delta);
    }
  }
}

function createStore(pxm = null) {
  let proxyManager = pxm;
  if (!proxyManager) {
    proxyManager = vtkProxyManager.newInstance({
      proxyConfiguration: Config.Proxy,
    });
  }

  const $store = new Vuex.Store({
    plugins: [ProxyManagerVuexPlugin(proxyManager)],
    state: {
      proxyManager, // TODO remove
      route: 'landing', // valid values: landing, app
      savingStateName: null,
      loadingState: false,
      screenshotDialog: false,
      pendingScreenshot: null,
      panels: {},
      cameraViewPoints: {},
      mostRecentViewPoint: null,
      collapseDatasetPanels: false,
      suppressBrowserWarning: false,
    },
    getters: {
      proxyManager(state) {
        return state.proxyManager;
      },
      cameraViewPoints(state) {
        return state.cameraViewPoints;
      },
      mostRecentViewPoint(state) {
        return state.mostRecentViewPoint;
      },
    },
    modules: {
      files: files(proxyManager),
      views: views(proxyManager),
      widgets: widgets(proxyManager),
    },
    mutations: {
      showLanding(state) {
        state.route = 'landing';
      },
      showApp(state) {
        state.route = 'app';
      },
      savingState(state, name = null) {
        state.savingStateName = name;
      },
      loadingState(state, flag) {
        state.loadingState = flag;
      },
      addPanel: (state, { component, priority = 0 }) => {
        if (!(priority in state.panels)) {
          Vue.set(state.panels, priority, []);
        }
        state.panels[priority].push(component);
      },
      openScreenshotDialog(state, screenshot) {
        state.pendingScreenshot = screenshot;
        state.screenshotDialog = true;
      },
      closeScreenshotDialog(state) {
        state.pendingScreenshot = null;
        state.screenshotDialog = false;
      },
      mostRecentViewPoint(state, viewPoint) {
        state.mostRecentViewPoint = viewPoint;
      },
      collapseDatasetPanels(state, value) {
        state.collapseDatasetPanels = value;
      },
      suppressBrowserWarning(state, value) {
        state.suppressBrowserWarning = value;
      },
    },
    actions: {
      addPanel: wrapMutationAsAction('addPanel'),
      closeScreenshotDialog: wrapMutationAsAction('closeScreenshotDialog'),
      collapseDatasetPanels: wrapMutationAsAction('collapseDatasetPanels'),
      suppressBrowserWarning: wrapMutationAsAction('suppressBrowserWarning'),
      saveState({ commit, state }, fileNameToUse) {
        const t = new Date();
        const fileName =
          fileNameToUse ||
          `${t.getFullYear()}${t.getMonth() +
            1}${t.getDate()}_${t.getHours()}-${t.getMinutes()}-${t.getSeconds()}.glance`;

        commit('savingState', fileName);

        const activeSourceId = proxyManager.getActiveSource()
          ? proxyManager.getActiveSource().getProxyId()
          : -1;

        const userData = {
          version: STATE_VERSION,
          activeSourceId,
          store: {
            route: state.route,
            views: state.views,
            widgets: state.widgets,
          },
        };

        const options = {
          recycleViews: true,
          datasetHandler(dataset, source) {
            const sourceMeta = source.get('name', 'url', 'remoteMetaData');
            const datasetMeta = dataset.get('name', 'url', 'remoteMetaData');
            const metadata = sourceMeta.url ? sourceMeta : datasetMeta;
            if (metadata.name && metadata.url) {
              return metadata;
            }
            if (source.getKey('girderProvenance')) {
              return {
                serializedType: 'girder',
                provenance: source.getKey('girderProvenance'),
                item: source.getKey('girderItem'),
              };
            }
            // Not a remote dataset so use basic dataset serialization
            return dataset.getState();
          },
        };

        const zip = new JSZip();
        proxyManager.saveState(options, userData).then((stateObject) => {
          zip.file('state.json', JSON.stringify(stateObject));
          zip
            .generateAsync({
              type: 'blob',
              compression: 'DEFLATE',
              compressionOptions: {
                level: 6,
              },
            })
            .then((blob) => {
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement('a');
              anchor.setAttribute('href', url);
              anchor.setAttribute('download', fileName);

              document.body.appendChild(anchor);
              anchor.click();
              document.body.removeChild(anchor);

              setTimeout(() => URL.revokeObjectURL(url), 60000);
            })
            .then(() => commit('savingState', null));
        });
      },
      restoreAppState({ commit, dispatch, state }, appState) {
        commit('loadingState', true);

        dispatch('resetWorkspace');
        return proxyManager
          .loadState(appState, {
            datasetHandler(ds) {
              if (ds.vtkClass) {
                return vtk(ds);
              }

              let name = ds.name;
              let url = ds.url;

              if (ds.serializedType === 'girder') {
                const { itemId, itemName } = ds.item;
                const { apiRoot } = ds.provenance;
                name = itemName;
                url = `${apiRoot}/item/${itemId}/download`;
              }

              return ReaderFactory.downloadDataset(name, url)
                .then((file) => ReaderFactory.loadFiles([file]))
                .then((readers) => readers[0])
                .then(({ dataset, reader }) => {
                  if (reader && reader.getOutputData) {
                    const newDS = reader.getOutputData();
                    newDS.set(ds, true); // Attach remote data origin
                    return newDS;
                  }
                  if (dataset && dataset.isA) {
                    dataset.set(ds, true); // Attach remote data origin
                    return dataset;
                  }
                  if (reader && reader.setProxyManager) {
                    reader.setProxyManager(proxyManager);
                    return null;
                  }
                  throw new Error('Invalid dataset');
                })
                .catch((e) => {
                  // more meaningful error
                  const moreInfo = `Dataset doesn't exist or adblock/firewall prevents access.`;
                  if ('xhr' in e) {
                    const { xhr } = e;
                    throw new Error(
                      `${xhr.statusText} (${xhr.status}): ${moreInfo}`
                    );
                  }
                  throw new Error(`${e.message} (${moreInfo})`);
                });
            },
          })
          .then((userData) => {
            const { version, store, $oldToNewIdMapping } = userData;
            if (version >= 2) {
              this.replaceState(merge(state, store));
            } else {
              this.replaceState(merge(state, userData));
            }

            // make sure store modules have a chance to rewrite their saved mappings
            // before we re-populate proxy manager state
            dispatch('rewriteProxyIds', $oldToNewIdMapping).then(() => {
              // Force update
              proxyManager.modified();

              // Activate visible view with a preference for the 3D one
              const visibleViews = proxyManager
                .getViews()
                .filter((view) => view.getContainer());
              const view3D = visibleViews.find(
                (view) => view.getProxyName() === 'View3D'
              );
              const viewToActivate = view3D || visibleViews[0];
              if (viewToActivate) {
                viewToActivate.activate();
              }

              // Make sure pre-existing view (not expected in state) have a representation
              proxyManager
                .getSources()
                .forEach(proxyManager.createRepresentationInAllViews);

              if (version >= 2) {
                const { activeSourceId } = userData;
                const id = $oldToNewIdMapping[activeSourceId];
                const source = proxyManager.getProxyById(id);
                if (source) {
                  source.activate();
                }
              } else {
                // old pre-versioned glance state files
                // activate first source, if any
                const source = proxyManager.getSources()[0];
                if (source) {
                  source.activate();
                }
              }
            });
          })
          .then(() => commit('loadingState', false));
      },
      resetWorkspace() {
        // use setTimeout to avoid some weird crashing with extractDomains
        proxyManager
          .getSources()
          .forEach((source) =>
            setTimeout(() => proxyManager.deleteProxy(source), 0)
          );
        setTimeout(() => {
          proxyManager.renderAllViews();
          proxyManager.resetCameraInAllViews();
        }, 0);
      },
      resetActiveCamera() {
        proxyManager.resetCamera();
      },
      increaseSlice({ state }) {
        if (state.route === 'app') {
          changeActiveSliceDelta(proxyManager, 1);
        }
      },
      decreaseSlice({ state }) {
        if (state.route === 'app') {
          changeActiveSliceDelta(proxyManager, -1);
        }
      },
      takeScreenshot({ commit, state }, viewToUse = null) {
        const view = viewToUse || proxyManager.getActiveView();
        const viewType = viewHelper.getViewType(view);
        if (view) {
          return view.captureImage().then((imgSrc) => {
            commit('openScreenshotDialog', {
              imgSrc,
              viewName: view.getName(),
              viewData: {
                background: state.views.backgroundColors[viewType],
              },
            });
          });
        }
        return Promise.resolve();
      },
      setCameraViewPoints({ dispatch, state }, viewPoints) {
        state.cameraViewPoints = viewPoints;
        const keys = Object.keys(viewPoints);
        if (keys.length !== 0) {
          // Set the camera to the first view point
          dispatch('changeCameraViewPoint', keys[0]);

          // Begin first person interaction
          const interactionStyle = 'FirstPerson';
          dispatch('views/setInteractionStyle3D', interactionStyle);
        }
      },
      changeCameraViewPoint({ commit, getters, state }, viewPointKey) {
        const allViews = state.proxyManager.getViews();
        const pxManager = getters.proxyManager;

        const viewPoints = getters.cameraViewPoints[viewPointKey] || {};
        const camera = viewPoints.camera;
        const showSources = viewPoints.show;
        const hideSources = viewPoints.hide;

        const moveCameraPromiseList = [];

        allViews
          .filter((v) => v.getName() === 'default')
          .forEach((v) => {
            // Keep the same focal distance, or else some kind of
            // shaking sometimes happens during camera interaction.
            const distance = v.getCamera().getDistance();
            const direction = [
              camera.focalPoint[0] - camera.position[0],
              camera.focalPoint[1] - camera.position[1],
              camera.focalPoint[2] - camera.position[2],
            ];

            const adjustedFocalPoint = [
              camera.position[0] + direction[0] * distance,
              camera.position[1] + direction[1] * distance,
              camera.position[2] + direction[2] * distance,
            ];

            const promise = v.moveCamera(
              adjustedFocalPoint,
              camera.position,
              camera.viewUp,
              100
            );
            moveCameraPromiseList.push(promise);
          });

        Promise.all(moveCameraPromiseList).then(() => {
          // Modify the source visibilities from the view point settings
          pxManager.getSources().forEach((source) => {
            const name = source.getName();

            if (!showSources.includes(name) && !hideSources.includes(name)) {
              // Don't change the visibility
              return;
            }

            const visible = showSources.includes(name);

            const rep = pxManager
              .getRepresentations()
              .filter((r) => r.getInput() === source)[0];

            if (rep.getVisibility() !== visible) {
              rep.setVisibility(visible);
            }
          });

          pxManager.renderAllViews();
        });

        commit('mostRecentViewPoint', viewPointKey);
      },
      previousViewPoint({ dispatch, getters }) {
        const lastViewPoint = getters.mostRecentViewPoint;
        if (!lastViewPoint) {
          // Nothing to do
          return;
        }

        const keys = Object.keys(getters.cameraViewPoints);
        if (!keys.includes(lastViewPoint)) {
          return;
        }

        const length = keys.length;
        const ind = (keys.indexOf(lastViewPoint) + length - 1) % length;
        dispatch('changeCameraViewPoint', keys[ind]);
      },
      nextViewPoint({ dispatch, getters }) {
        const lastViewPoint = getters.mostRecentViewPoint;
        if (!lastViewPoint) {
          // Nothing to do
          return;
        }

        const keys = Object.keys(getters.cameraViewPoints);
        if (!keys.includes(lastViewPoint)) {
          return;
        }

        const ind = (keys.indexOf(lastViewPoint) + 1) % keys.length;
        dispatch('changeCameraViewPoint', keys[ind]);
      },
    },
  });

  // We currently need access to the store in a couple of places where
  // only the proxy manager is available.
  // TODO: remove this access requirement and the next line when possible.
  proxyManager.set({ $store }, true);

  return $store;
}

export default createStore;

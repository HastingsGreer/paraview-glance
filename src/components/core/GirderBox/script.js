import SvgIcon from 'paraview-glance/src/components/widgets/SvgIcon';
import { mapState } from 'vuex';

import Datasets from 'paraview-glance/src/components/core/Datasets';

import { Authentication as GirderAuthentication } from '@girder/components/src/components';
import { FileManager as GirderFileManager } from '@girder/components/src/components/Snippet';

import writeImageArrayBuffer from 'itk/writeImageArrayBuffer';
import Matrix from 'itk/Matrix';

// ----------------------------------------------------------------------------

function convertVtkToItkImage(vtkImage) {
  const origin = [0, 0, 0];
  const spacing = [1, 1, 1];

  const dimensions = [1, 1, 1];
  const direction = new Matrix(3, 3);

  const datatype = {
    Uint8Array: 'uint8_t',
    Int8Array: 'int8_t',
    Uint16Array: 'uint16_t',
    Int16Array: 'int16_t',
  }[
    vtkImage
      .getPointData()
      .getScalars()
      .get().dataType
  ];

  for (let idx = 0; idx < vtkImage.getDimensions().length; ++idx) {
    origin[idx] = vtkImage.getOrigin()[idx];
    spacing[idx] = vtkImage.getSpacing()[idx];
    dimensions[idx] = vtkImage.getDimensions()[idx];
    for (let col = 0; col < vtkImage.getDimensions().length; ++col) {
      // ITK (and VTKMath) use a row-major index axis, but the direction
      // matrix on the vtkImageData is a webGL matrix, which uses a
      // column-major data layout. Transpose the direction matrix from
      // itkImage when instantiating that vtkImageData direction matrix.
      direction.data[col + idx * 3] = vtkImage.getDirection()[idx + col * 3];
    }
  }
  const itkImage = {
    imageType: {
      dimension: vtkImage.getDimensions().length,
      pixelType: 1,
      componentType: datatype,
      components: vtkImage
        .getPointData()
        .getArrayByIndex(0)
        .getNumberOfComponents(),
    },
    name: 'itkimagename',
    origin,
    spacing,
    direction,
    size: dimensions,
    data: vtkImage
      .getPointData()
      .getScalars()
      .get().values,
  };
  return itkImage;
}

export default {
  name: 'GirderBox',
  components: {
    SvgIcon,
    GirderAuthentication,
    GirderFileManager,
    Datasets,
  },
  inject: ['girderRest'],
  data() {
    return {
      selected: [],
      location: null,
      changeServer: false,
    };
  },
  computed: {
    currentUserLogin() {
      return this.girderRest.user ? this.girderRest.user.login : 'anonymous';
    },
    loggedOut() {
      return this.girderRest.user === null;
    },
    ...mapState({
      proxyManager: 'proxyManager',
    }),
  },
  methods: {
    load() {
      const urls = this.selected.map((elem) => {
        /* eslint-disable-next-line no-underscore-dangle */
        return `${this.girderRest.apiRoot}/item/${elem._id}/download`;
      });
      const names = this.selected.map((elem) => {
        return elem.name;
      });
      this.$store.dispatch('OPEN_REMOTE_FILES', { urls, names });
      this.$emit('close');
    },
    export2pc() {
      const dataset = this.proxyManager.getActiveSource().get().dataset;

      const image = convertVtkToItkImage(dataset);

      writeImageArrayBuffer(null, false, image, 'out.mha').then(
        function recieve({ buffer }) {
          const blob = new Blob([buffer]);
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.setAttribute('href', url);
          anchor.setAttribute('download', 'out.mha');

          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
        }
      );
    },
    upload() {
      const dataset = this.proxyManager.getActiveSource().get().dataset;

      const image = convertVtkToItkImage(dataset);

      writeImageArrayBuffer(null, false, image, 'out.mha').then(
        function recieve({ buffer }) {
          const blob = new Blob([buffer]);
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.setAttribute('href', url);
          anchor.setAttribute('download', 'out.mha');

          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
        }
      );
    },
  },
};

import { mapState } from 'vuex';

import macro from 'vtk.js/Sources/macro';

import utils from 'paraview-glance/src/utils';
import SourceSelect from 'paraview-glance/src/components/widgets/SourceSelect';
import ProxyManagerMixin from 'paraview-glance/src/mixins/ProxyManagerMixin';

import runPipelineBrowser from 'itk/runPipelineBrowser';
import ITKHelper from 'vtk.js/Sources/Common/DataModel/ITKHelper';
import IOTypes from "itk/IOTypes";

import ReaderFactory from 'paraview-glance/src/io/ReaderFactory';

const { vtkErrorMacro } = macro;
const { makeSubManager, forAllViews } = utils;

function unsubList(list) {
  while (list.length) {
    list.pop().unsubscribe();
  }
}

// ----------------------------------------------------------------------------

export default {
  name: 'MedianTool',
  components: {
    SourceSelect,
  },
  mixins: [ProxyManagerMixin],
  props: ['enabled'],
  data() {
    return {
      targetVolumeId: -1,
    };
  },
  computed: {
    ...mapState(['proxyManager']),
    targetVolume() {
      return this.proxyManager.getProxyById(this.targetVolumeId);
    },
  },
  proxyManager: {
    onProxyRegistrationChange(info) {
      const { proxyGroup, action, proxy, proxyId } = info;
      if (proxyGroup === 'Views' && action === 'register') {
        if (this.enabled) {
          this.addCropToView(proxy);
        }
      }
    },
  },
  mounted() {
    this.stateSub = makeSubManager();
  },
  beforeDestroy() {
    this.stateSub.unsub();
  },
  methods: {
    filterImages(source) {
      return source && source.getType() === 'vtkImageData';
    },
    setTargetVolume(sourceId) {
      this.targetVolumeId = sourceId;
    },
    median() {
      console.log(ITKHelper.convertVtkToItkImage);
      console.log("targetvolume isa ", this.targetVolume.getClassName());

      window.horse = this.targetVolume;
      const itkImage = ITKHelper.convertVtkToItkImage(this.targetVolume.getDataset());
      console.log("my itk image pre filter", itkImage);
      // insist on a copy so that the source array isn't neutered
      itkImage.data = itkImage.data.slice(0);
      runPipelineBrowser(null, 
        'hello', // executable
        ['medianInput.json', 'output.json', '5'], // args
        [{path: "output.json", type: IOTypes.Image}], //outputs
        [{data: itkImage, path: "medianInput.json", type: IOTypes.Image}] // inputs
      ).then((outputImage) => {
    
        console.log(outputImage);
        const itkOutputImage = outputImage.outputs[0].data;
        itkOutputImage.data = new Uint8Array(itkOutputImage.data);


        const vtkOutputImage = ITKHelper.convertItkToVtkImage(itkOutputImage);
        
        console.log("vtk output image", vtkOutputImage.isA("vtkDataSet"));

        ReaderFactory.registerReadersToProxyManager(
          [
            {
              name: `Median of ${this.targetVolume.getName()}`,
              dataset: vtkOutputImage,
            },
          ],
          this.proxyManager
        );




      });

    }
  },
};

import SvgIcon from 'paraview-glance/src/components/widgets/SvgIcon';

import { Authentication as GirderAuthentication } from '@girder/components/src/components';
import { FileManager as GirderFileManager} from '@girder/components/src/components/Snippet';

// ----------------------------------------------------------------------------

export default {
  name: 'GirderBox',
  components: {
    SvgIcon,
    GirderAuthentication,
    GirderFileManager,
  },
  inject: ['girderRest'],
  data() {
    return {
      selected: [],
    };
  },
  computed: {
    currentUserLogin() {
      return this.girderRest.user ? this.girderRest.user.login : 'anonymous';
    },
    loggedOut() {
      return this.girderRest.user === null;
    },
  },
  methods: {
    load() {
      console.log(this.selected);
    },
  },
};

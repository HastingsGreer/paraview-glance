import SvgIcon from 'paraview-glance/src/components/widgets/SvgIcon';

import { Authentication as GirderAuthentication } from '@girder/components/src/components';
import { FileManager as GirderDataBrowser } from '@girder/components/src/components/Snippet';

// ----------------------------------------------------------------------------

export default {
  name: 'GirderBox',
  components: {
    SvgIcon,
    GirderAuthentication,
    GirderDataBrowser,
  },
  inject: ['girderRest'],
  data() {
    return { 1: 2 };
  },
  computed: {
    currentUserLogin() {
      return this.girderRest.user ? this.girderRest.user.login : 'anonymous';
    },
    loggedOut() {
      return this.girderRest.user === null;
    },
  },
};

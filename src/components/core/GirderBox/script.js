import SvgIcon from 'paraview-glance/src/components/widgets/SvgIcon';

import { Authentication as GirderAuthentication } from '@girder/components/src/components';
import { FileManager as GirderFileManager } from '@girder/components/src/components/Snippet';

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
  },
  methods: {
    load() {
      console.log(this.selected);
      const urls = this.selected.map((elem) => {
        /* eslint-disable-next-line no-underscore-dangle */
        return `https://data.kitware.com/api/v1/item/${elem._id}/download`;
      });
      const names = this.selected.map((elem) => {
        return elem.name;
      });
      this.$store.dispatch('OPEN_REMOTE_FILES', { urls, names });
      this.$emit('close');
    },
  },
};

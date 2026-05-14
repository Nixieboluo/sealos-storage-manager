import cssHasPseudo from 'css-has-pseudo/browser'
import 'core-js/stable/aggregate-error'
import 'core-js/stable/array/at'
import 'core-js/stable/array/find-last'
import 'core-js/stable/array/find-last-index'
import 'core-js/stable/array/to-reversed'
import 'core-js/stable/array/to-sorted'
import 'core-js/stable/array/to-spliced'
import 'core-js/stable/array/with'
import 'core-js/stable/object/has-own'
import 'core-js/stable/promise/any'
import 'core-js/stable/promise/with-resolvers'
import 'core-js/actual/string/at'
import 'core-js/stable/string/replace-all'
import 'core-js/stable/structured-clone'
import 'container-query-polyfill'

if (typeof document !== 'undefined') {
	cssHasPseudo(document)
}

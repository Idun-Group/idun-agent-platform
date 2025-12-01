import { AbortError, isAbortError } from './AbortError';
export function all(signal, executor) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason ?? new AbortError());
            return;
        }
        const innerAbortController = new AbortController();
        const promises = executor(innerAbortController.signal);
        if (promises.length === 0) {
            resolve([]);
            return;
        }
        const abortListener = () => {
            innerAbortController.abort(signal.reason ?? new AbortError());
        };
        signal.addEventListener('abort', abortListener);
        let rejection;
        const results = new Array(promises.length);
        let settledCount = 0;
        function settled() {
            settledCount += 1;
            if (settledCount === promises.length) {
                signal.removeEventListener('abort', abortListener);
                if (rejection != null) {
                    reject(rejection.reason);
                }
                else {
                    resolve(results);
                }
            }
        }
        for (const [i, promise] of promises.entries()) {
            promise.then(value => {
                results[i] = value;
                settled();
            }, reason => {
                innerAbortController.abort(new AbortError('One of the promises passed to all() rejected', false));
                if (rejection == null ||
                    (!isAbortError(reason) && isAbortError(rejection.reason))) {
                    rejection = { reason };
                }
                settled();
            });
        }
    });
}
//# sourceMappingURL=all.js.map
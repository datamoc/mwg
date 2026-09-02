/* tslint:disable */
/* eslint-disable */
/**
* An Archive Reader
*/
export class Reader {
  free(): void;
/**
* Make a new [`Reader`].
*
* Accepts either an [`Uint8Array`] or an [`ArrayBuffer`].
* @param {any} value
*/
  constructor(value: any);
/**
* Get the next entry.
*
* # Arguments
* Takes a function as an argument.
* This function gets the file name and size as arguments.
* If this function returns true, it is skipped.
* If this function is absent, the entry is not skipped.
* @param {Function | undefined} skip
* @returns {ReaderEntry | undefined}
*/
  readEntry(skip?: Function): ReaderEntry | undefined;
}
/**
* An entry from a [`Reader`].
*/
export class ReaderEntry {
  free(): void;
/**
* Get the file data
*/
  readonly data: Uint8Array;
/**
* Get the file name.
*/
  readonly fileName: string;
}

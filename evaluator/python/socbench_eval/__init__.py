"""socbench_eval — Python port of the McMaster Standardized Evaluation Tool core.

Evaluates a submission package containing Model.py against the blinded dataset
(exported with matlab/Export_Blind_Data.m) and writes results.json in the same
schema as matlab/Evaluate_Submission.m, so the website treats both identically.
"""

__version__ = "0.1.0"
